import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile, ROOT } from "../scripts/sqlite";

loadEnvFile();

type PreguntaJson = {
  texto: string;
  opciones: { clave: string; texto: string }[];
  tipo: "opcion_multiple" | "texto_abierto" | "etiquetar_diagrama" | "si_no";
};
type ExamenJson = {
  archivo: string;
  hoja: string;
  slug: string;
  modelo: string;
  grupo: string;
  variante: string;
  confianza: "alta" | "media" | "baja";
  nota?: string;
  imagenes: string[];
  preguntas: PreguntaJson[];
  casillas_pieza_impresas: number;
  casillas_faltantes_en_formato: number[];
  extras: string[];
  codigo_documento?: string;
  duplicado_de?: string;
};

const CLAVE_HIGHLAND = "BBGGBBGBGBGGBGBGGBGBGBBGGBGBBG".split("") as ("G" | "B")[];

const VIGENCIA_HIGHLAND = new Date("2026-01-01T06:00:00.000Z");

const AREAS = ["MOLDEO", "PINTURA", "CALIDAD", "INDIRECTO", "TOOL ROOM"];
const TURNOS = ["1ER", "2DO", "3ER", "ESPECIAL", "4X3"];
const REQUISITOS = [
  { codigo: "EXAMEN_SEGURIDAD", nombre: "Examen de seguridad", conCalificacion: true },
  { codigo: "EXAMEN_INDUCCION", nombre: "Examen de inducción", conCalificacion: true },
  { codigo: "CHECKLIST_ENTRENAMIENTO", nombre: "Check list de entrenamiento" },
  { codigo: "CARGA_DESCARGA_RACKS", nombre: "Carga y descarga de racks", soloArea: "PINTURA" },
  { codigo: "EMPAQUE", nombre: "Empaque", soloArea: "PINTURA" },
  { codigo: "PINES_33", nombre: "33 pines", soloArea: "PINTURA" },
];

const MODELOS_SIN_EXAMEN = [
  { slug: "misc-visibles", nombre: "MISCELÁNEOS VISIBLES", grupo: "MOLDEO" },
  { slug: "misc-no-visibles", nombre: "MISCELÁNEOS NO VISIBLES", grupo: "MOLDEO" },
  { slug: "inspeccion-pintura", nombre: "INSPECCIÓN (PINTURA)", grupo: "PINTURA" },
  { slug: "volvo", nombre: "VOLVO", grupo: "ENSAMBLES" },
  { slug: "hud-bezel", nombre: "HUD BEZEL", grupo: "ENSAMBLES" },
  { slug: "cdx", nombre: "CDX", grupo: "ENSAMBLES" },
  { slug: "raptor", nombre: "RAPTOR", grupo: "ENSAMBLES" },
  {
    slug: "banera",
    nombre: "BAÑERA",
    grupo: "POR_CONFIRMAR",
    porConfirmar: true,
    notaMapeo: "Aparece en PROMEDIOS; no se sabe a qué área pertenece.",
  },
];

const ALIAS: Record<string, string[]> = {
  highland: ["EVERES / HIGHLAND", "EVEREST / HIGHLAND", "ENSAMBLE HIGHLAND", "HIGHAND"],
  keyless: ["KEYLES", "HONDA KEYLESS"],
  "18rm": ["18RM 220D GARNISH", "HONDA 18RM"],
  alpine: ["B1TXX ALPINE"],
  "alto-brillo": ["HIGH GLOSS ALPINE", "ALTO BRILLO"],
  "alpine-35": ["PIEZA BRILLO BAJO 35"],
  "alpine-33": ["33 PINES Y CANDADOS QUEBRADOS"],
  "cubiertas-inj": ["CUBIERTAS PAB/DAB", "CUBIERTAS"],
  "cubiertas-pai": ["CUBIERTA PAI"],
  "boton-laser": ["BOTON LASEADO", "BOTON LASEREADO"],
  "boton-sin-laser": ["BOTON SIN LASEAR", "BOTON SIN LASEREADO"],
  "bezel-inj": ["BEZEL"],
};

const ORDEN_GRUPO: Record<string, number> = { MOLDEO: 1, PINTURA: 2, ENSAMBLES: 3, CALIDAD: 4, POR_CONFIRMAR: 9 };
const ETIQUETA_VARIANTE: Record<string, string> = {
  principal: "principal",
  sin_practica: "sin práctica",
  primera_certificacion: "1ª certificación",
  anual: "anual",
  corta: "corta",
};

const PERSONAS: [string, string, string, string, string, string][] = [
  ["1001", "Ana Martínez López", "MOLDEO", "1ER", "OPERADOR", "2024-03-11"],
  ["1002", "Luis Hernández Ruiz", "MOLDEO", "1ER", "OPERADOR", "2025-08-04"],
  ["1003", "María Fernanda Ortiz", "MOLDEO", "2DO", "OPERADOR", "2026-07-20"],
  ["1004", "José Ramírez Soto", "MOLDEO", "2DO", "TEC", "2023-11-02"],
  ["1005", "Carmen Díaz Vega", "MOLDEO", "3ER", "OPERADOR", "2026-09-15"],
  ["1006", "Jorge Castillo Peña", "MOLDEO", "3ER", "SETUP", "2022-05-30"],
  ["1007", "Patricia Morales Cruz", "PINTURA", "1ER", "OPERADOR", "2025-01-13"],
  ["1008", "Ricardo Flores Medina", "PINTURA", "1ER", "OPERADOR", "2026-06-01"],
  ["1009", "Gabriela Torres Ríos", "PINTURA", "2DO", "OPERADOR", "2025-10-27"],
  ["1010", "Fernando Gutiérrez Luna", "PINTURA", "2DO", "SUP", "2021-09-06"],
  ["1011", "Sofía Reyes Aguilar", "PINTURA", "3ER", "OPERADOR", "2026-10-05"],
  ["1012", "Miguel Ángel Navarro", "PINTURA", "4X3", "MAT", "2024-12-09"],
  ["1013", "Daniela Jiménez Campos", "CALIDAD", "1ER", "AUDITOR/SWAT", "2025-04-21"],
  ["1014", "Alejandro Vargas Mendoza", "CALIDAD", "1ER", "AUDITOR/SWAT", "2026-05-18"],
  ["1015", "Verónica Romero Silva", "CALIDAD", "2DO", "AUDITOR/SWAT", "2023-07-17"],
  ["1016", "Héctor Salazar Ibarra", "CALIDAD", "3ER", "COO", "2024-02-26"],
  ["1017", "Laura Domínguez Pineda", "INDIRECTO", "ESPECIAL", "OPERADOR", "2025-11-10"],
  ["1018", "Raúl Cervantes Rosas", "INDIRECTO", "1ER", "OPERADOR", "2026-08-24"],
  ["1019", "Elena Guerrero Fuentes", "TOOL ROOM", "1ER", "TEC", "2022-10-03"],
  ["1020", "Óscar Delgado Paredes", "MOLDEO", "1ER", "OPERADOR", "2026-04-06"],
];

function dimensiones(archivo: string): { ancho: number; alto: number } | null {
  if (!existsSync(archivo)) return null;
  const b = readFileSync(archivo);
  if (b.readUInt32BE(0) === 0x89504e47) return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) break;
      const marca = b[i + 1]!;
      const largo = b.readUInt16BE(i + 2);
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) {
        return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
      }
      i += 2 + largo;
    }
  }
  return null;
}

function firmasDe(extras: string[]): string[] {
  const f = new Set<string>();
  for (const e of extras) {
    if (!/firma/i.test(e)) continue;
    f.add(/calidad/i.test(e) ? "calidad" : "operador");
  }
  return [...f];
}

async function main() {

  const { db } = await import("../lib/db");
  const { claveAlias } = await import("../lib/texto");
  const { asegurarSuperadminInicial, hashPassword } = await import("../lib/services/usuarios");
  const { publicarVersion } = await import("../lib/services/versiones");
  const { crearAsignacion } = await import("../lib/services/asignaciones");
  const { capturarPapel } = await import("../lib/services/intentos");
  const { CONFIG_DEFAULTS } = await import("../lib/config");
  type Actor = import("../lib/domain").Actor;

  const p = db();
  const log = (m: string) => console.log(`  ${m}`);
  console.log("Seed de desarrollo");

  const sa = await asegurarSuperadminInicial();
  log(`Superadmin ${process.env.SUPERADMIN_EMAIL} ${sa.creado ? "creado (contraseña temporal)" : "ya existía"}`);
  const seedPass = process.env.SEED_PASSWORD;
  if (!seedPass) throw new Error("Define SEED_PASSWORD en .env (contraseña de admin@demo.local y lectura@demo.local)");
  const hash = await hashPassword(seedPass);
  const usuarios: Record<"ADMIN" | "LECTURA", Actor> = {} as never;
  for (const [rol, email, nombre] of [
    ["ADMIN", "admin@demo.local", "Adriana Calidad"],
    ["LECTURA", "lectura@demo.local", "Lorenzo Supervisor"],
  ] as const) {
    const u = await p.usuario.upsert({
      where: { email },
      create: { email, nombre, rol, passwordHash: hash, creadoPorId: sa.id },
      update: {},
    });
    usuarios[rol] = { id: u.id, nombre: u.nombre, rol };
  }
  log("Usuarios admin@demo.local y lectura@demo.local (contraseña: SEED_PASSWORD de .env)");
  const admin = usuarios.ADMIN;

  for (const [i, nombre] of AREAS.entries())
    await p.area.upsert({ where: { nombre }, create: { nombre, orden: i }, update: {} });
  for (const [i, nombre] of TURNOS.entries())
    await p.turno.upsert({ where: { nombre }, create: { nombre, orden: i }, update: {} });
  for (const [i, r] of REQUISITOS.entries()) {
    await p.tipoRequisito.upsert({
      where: { codigo: r.codigo },
      create: {
        codigo: r.codigo,
        nombre: r.nombre,
        soloArea: r.soloArea ?? null,
        conCalificacion: r.conCalificacion ?? false,
        orden: i,
      },
      update: {},
    });
  }
  log(`${AREAS.length} áreas, ${TURNOS.length} turnos, ${REQUISITOS.length} tipos de requisito`);

  const data = JSON.parse(readFileSync(path.join(ROOT, "data", "examenes.json"), "utf8")) as { examenes: ExamenJson[] };
  const examenesJson = data.examenes.filter((e) => !e.duplicado_de);
  const modelos = new Map<
    string,
    { slug: string; nombre: string; grupo: string; porConfirmar: boolean; notaMapeo: string | null }
  >();
  for (const e of examenesJson) {
    if (modelos.has(e.slug)) continue;
    modelos.set(e.slug, {
      slug: e.slug,
      nombre: e.modelo,
      grupo: e.grupo === "TODO" ? "POR_CONFIRMAR" : e.grupo,
      porConfirmar: e.confianza === "baja" || e.grupo === "TODO",
      notaMapeo: e.nota?.trim() || null,
    });
  }
  for (const m of MODELOS_SIN_EXAMEN) {
    modelos.set(m.slug, { ...m, porConfirmar: m.porConfirmar ?? false, notaMapeo: m.notaMapeo ?? null });
  }
  const ordenados = [...modelos.values()].sort(
    (a, b) => (ORDEN_GRUPO[a.grupo] ?? 8) - (ORDEN_GRUPO[b.grupo] ?? 8) || a.nombre.localeCompare(b.nombre, "es"),
  );
  const idModelo = new Map<string, string>();
  for (const [i, m] of ordenados.entries()) {
    const r = await p.modelo.upsert({ where: { slug: m.slug }, create: { ...m, orden: i }, update: {} });
    idModelo.set(m.slug, r.id);
    for (const alias of [m.nombre, ...(ALIAS[m.slug] ?? [])]) {
      const aliasKey = claveAlias(alias);
      await p.modeloAlias.upsert({ where: { aliasKey }, create: { alias, aliasKey, modeloId: r.id }, update: {} });
    }
  }
  log(`${modelos.size} modelos (${MODELOS_SIN_EXAMEN.length} sin examen en el sistema)`);

  let publicados = 0;
  let borradores = 0;
  for (const e of examenesJson) {
    const modeloId = idModelo.get(e.slug)!;
    const modelo = modelos.get(e.slug)!;
    const examen = await p.examen.upsert({
      where: { modeloId_variante: { modeloId, variante: e.variante } },
      create: {
        modeloId,
        variante: e.variante,
        nombre: `${modelo.nombre} — ${ETIQUETA_VARIANTE[e.variante] ?? e.variante}`,
        porConfirmar: e.confianza === "baja",
      },
      update: {},
    });
    if (await p.examenVersion.count({ where: { examenId: examen.id } })) continue;

    const esHighland = e.slug === "highland" && e.variante === "principal";
    const extras = e.extras.join(" | ");
    const version = await p.examenVersion.create({
      data: {
        examenId: examen.id,
        version: 1,
        creadoPorId: admin.id,
        pesoFisico: CONFIG_DEFAULTS.pesoFisicoDefault,
        pesoTeorico: CONFIG_DEFAULTS.pesoTeoricoDefault,
        teoriaMax: CONFIG_DEFAULTS.teoriaMaxDefault,
        modoTeoria: "MANUAL",
        incluyePractica: /PRACTICA DE 3 DIAS/i.test(extras),
        requiereSegundaInspeccion: /2da insp/i.test(extras),
        firmas: JSON.stringify(firmasDe(e.extras)),
        codigoDocumento: e.codigo_documento ?? null,
        origenArchivo: `${e.archivo} / ${e.hoja}`,
        notas: e.nota?.trim() || null,
      },
    });

    const piezas = esHighland
      ? CLAVE_HIGHLAND.map((esperado, i) => ({ numero: i + 1, esperado }))
      : Array.from({ length: e.casillas_pieza_impresas }, (_, i) => i + 1)
          .filter((n) => !e.casillas_faltantes_en_formato.includes(n))
          .map((numero) => ({ numero, esperado: null }));
    await p.piezaClave.createMany({
      data: piezas.map((x, i) => ({ versionId: version.id, orden: i + 1, numero: x.numero, esperado: x.esperado })),
    });

    for (const [i, img] of e.imagenes.entries()) {
      const dim = dimensiones(path.join(ROOT, "public", img));
      await p.examenImagen.create({
        data: { versionId: version.id, ruta: `/${img}`, orden: i, ancho: dim?.ancho ?? null, alto: dim?.alto ?? null },
      });
    }

    let anterior: { id: string; tipo: string } | null = null;
    for (const [i, q] of e.preguntas.entries()) {
      const condicional = anterior?.tipo === "SI_NO" && /^\s*si la respuesta anterior es si\b/i.test(q.texto);
      const creada: { id: string; tipo: string } = await p.pregunta.create({
        data: {
          versionId: version.id,
          orden: i + 1,
          tipo: condicional ? "CONDICIONAL" : q.tipo.toUpperCase(),
          texto: q.texto.trim(),
          opciones: JSON.stringify(q.opciones),
          respuestaCorrecta: null,
          puntaje: null, 
          dependeDeId: condicional ? anterior!.id : null,
          dependeDeValor: condicional ? "SI" : null,
        },
      });
      anterior = creada;
    }

    if (esHighland) {

      await publicarVersion(admin, version.id, { vigenteDesde: VIGENCIA_HIGHLAND, aceptarSinRespuestaCorrecta: true });
      publicados++;
    } else borradores++;
  }
  log(`${examenesJson.length} exámenes: ${publicados} publicado(s) ahora, ${borradores} borrador(es) nuevos`);

  const areas = new Map((await p.area.findMany()).map((a) => [a.nombre, a.id]));
  const turnos = new Map((await p.turno.findMany()).map((t) => [t.nombre, t.id]));
  for (const [numeroEmpleado, nombre, area, turno, puesto, ingreso] of PERSONAS) {
    await p.persona.upsert({
      where: { numeroEmpleado },
      create: {
        numeroEmpleado,
        nombre,
        areaId: areas.get(area)!,
        turnoId: turnos.get(turno)!,
        puesto,
        fechaIngresoPuesto: new Date(`${ingreso}T12:00:00.000Z`),
      },
      update: {},
    });
  }
  log(`${PERSONAS.length} empleados de ejemplo`);

  const highland = await p.examen.findFirstOrThrow({
    where: { modelo: { slug: "highland" }, variante: "principal" },
  });
  const persona = (num: string) => p.persona.findUniqueOrThrow({ where: { numeroEmpleado: num } });
  if ((await p.asignacion.count()) === 0 && (await p.intento.count()) === 0) {
    for (const [num, quien] of [
      ["1013", usuarios.LECTURA],
      ["1014", admin],
      ["1002", admin],
    ] as const) {
      await crearAsignacion(quien, { personaId: (await persona(num)).id, examenId: highland.id });
    }

    const ayer = new Date(Date.now() - 24 * 3600_000);
    await capturarPapel(admin, {
      personaId: (await persona("1007")).id,
      examenId: highland.id,
      fechaAplicacion: ayer,
      piezas: CLAVE_HIGHLAND.slice(0, 29).map((r, i) => ({
        numero: i + 1,
        respuesta: i === 3 || i === 17 ? (r === "G" ? "B" : "G") : r,
        defecto: i === 3 ? "Rebaba en el borde" : i === 17 ? "Raya" : undefined,
      })),
      aplicadoPorNombre: "Adriana Calidad",
    });
    log("Actividad: 3 asignaciones pendientes de Highland y 1 examen en papel por calificar");
  }
  
  const gabriela = await persona("1009");
  if ((await p.intento.count({ where: { personaId: gabriela.id } })) === 0) {
    const haceDosDias = new Date(Date.now() - 2 * 24 * 3600_000);
    await capturarPapel(admin, {
      personaId: gabriela.id,
      examenId: highland.id,
      fechaAplicacion: haceDosDias,
      piezas: CLAVE_HIGHLAND.map((r, i) => ({
        numero: i + 1,
        respuesta: i === 9 ? (r === "G" ? "B" : "G") : r,
        defecto: i === 9 ? "Mancha" : undefined,
      })),
      aplicadoPorNombre: "Adriana Calidad",
    });
    log("Actividad: examen en papel de Gabriela Torres (1009) por calificar");
  }

  await p.$disconnect();
  console.log("✓ Seed completo");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
