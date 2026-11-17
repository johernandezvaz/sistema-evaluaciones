import type { Actor } from "../domain";
import { db, type Tx } from "../db";
import { AppError, NotFoundError } from "../errors";
import { requirePermission } from "../auth/permissions";
import { registrarAudit } from "./audit";
import { formatFechaHora } from "../time";

export async function resolverVersion(examenId: string, fecha: Date, client: Tx = db()) {
  return client.examenVersion.findFirst({
    where: {
      examenId,
      estado: { not: "BORRADOR" },
      vigenteDesde: { lte: fecha },
      OR: [{ vigenteHasta: null }, { vigenteHasta: { gt: fecha } }],
    },
    orderBy: { vigenteDesde: "desc" },
  });
}

export async function crearBorrador(actor: Actor, examenId: string, basadaEnId?: string) {
  requirePermission(actor, "examen:editar");
  return db().$transaction(async (tx) => {
    const examen = await tx.examen.findUnique({ where: { id: examenId } });
    if (!examen) throw new NotFoundError("El examen");
    const yaHay = await tx.examenVersion.findFirst({ where: { examenId, estado: "BORRADOR" } });
    if (yaHay) throw new AppError("BORRADOR_EXISTENTE", `Ya existe el borrador v${yaHay.version} de este examen`);
    const ultima = await tx.examenVersion.aggregate({ where: { examenId }, _max: { version: true } });
    const version = (ultima._max.version ?? 0) + 1;

    const base = basadaEnId
      ? await tx.examenVersion.findUnique({
          where: { id: basadaEnId },
          include: { preguntas: true, piezas: true, imagenes: { include: { flechas: true } } },
        })
      : null;
    if (basadaEnId && (!base || base.examenId !== examenId)) throw new NotFoundError("La versión base");

    const nueva = await tx.examenVersion.create({
      data: {
        examenId,
        version,
        basadaEnId: base?.id ?? null,
        creadoPorId: actor.id,
        ...(base && {
          pesoFisico: base.pesoFisico,
          pesoTeorico: base.pesoTeorico,
          teoriaMax: base.teoriaMax,
          modoTeoria: base.modoTeoria,
          incluyePractica: base.incluyePractica,
          requiereSegundaInspeccion: base.requiereSegundaInspeccion,
          firmas: base.firmas,
          codigoDocumento: base.codigoDocumento,
          origenArchivo: base.origenArchivo,
          notas: base.notas,
        }),
      },
    });

    if (base) {
      await tx.piezaClave.createMany({
        data: base.piezas.map((p) => ({
          versionId: nueva.id,
          orden: p.orden,
          numero: p.numero,
          esperado: p.esperado,
          descripcion: p.descripcion,
        })),
      });
      const mapaImagen = new Map<string, string>();
      for (const img of base.imagenes) {
        const n = await tx.examenImagen.create({
          data: { versionId: nueva.id, ruta: img.ruta, orden: img.orden, ancho: img.ancho, alto: img.alto },
        });
        mapaImagen.set(img.id, n.id);
      }
      const mapaPregunta = new Map<string, string>();

      const ordenadas = [...base.preguntas].sort(
        (a, b) => Number(!!a.dependeDeId) - Number(!!b.dependeDeId) || a.orden - b.orden,
      );
      for (const q of ordenadas) {
        const n = await tx.pregunta.create({
          data: {
            versionId: nueva.id,
            orden: q.orden,
            tipo: q.tipo,
            texto: q.texto,
            opciones: q.opciones,
            respuestaCorrecta: q.respuestaCorrecta,
            puntaje: q.puntaje,
            dependeDeId: q.dependeDeId ? (mapaPregunta.get(q.dependeDeId) ?? null) : null,
            dependeDeValor: q.dependeDeValor,
          },
        });
        mapaPregunta.set(q.id, n.id);
      }
      const flechas = base.imagenes.flatMap((i) => i.flechas);
      if (flechas.length) {
        await tx.diagramaFlecha.createMany({
          data: flechas.map((f) => ({
            preguntaId: mapaPregunta.get(f.preguntaId)!,
            imagenId: mapaImagen.get(f.imagenId)!,
            numero: f.numero,
            x: f.x,
            y: f.y,
            angulo: f.angulo,
            zonaCorrecta: f.zonaCorrecta,
          })),
        });
      }
    }

    await registrarAudit(tx, actor, {
      accion: "CREAR",
      entidad: "ExamenVersion",
      entidadId: nueva.id,
      resumen: `Creó el borrador v${version} de ${examen.nombre}${base ? ` (copia de v${base.version})` : ""}`,
    });
    return nueva;
  });
}

export type OpcionesPublicar = {
  vigenteDesde?: Date;
  motivo?: string;
  ahora?: Date;
  aceptarSinRespuestaCorrecta?: boolean;
};

type PreguntaClave = {
  orden: number;
  texto: string;
  tipo: string;
  respuestaCorrecta: string | null;
  flechas: { zonaCorrecta: string | null }[];
};

export function preguntasSinRespuestaCorrecta(preguntas: PreguntaClave[]) {
  return preguntas
    .filter((q) =>
      q.tipo === "TEXTO_ABIERTO"
        ? false
        : q.tipo === "ETIQUETAR_DIAGRAMA"
          ? q.flechas.length === 0 || q.flechas.some((f) => f.zonaCorrecta === null)
          : q.respuestaCorrecta === null,
    )
    .map((q) => ({ orden: q.orden, texto: q.texto }));
}

const listaPreguntas = (ps: { orden: number }[]) => ps.map((p) => p.orden).join(", ");


export async function validarPublicable(versionId: string, client: Tx = db()): Promise<string[]> {
  const v = await client.examenVersion.findUnique({
    where: { id: versionId },
    include: { piezas: true, preguntas: { include: { flechas: true } } },
  });
  if (!v) throw new NotFoundError("La versión");
  const sinRespuesta = preguntasSinRespuestaCorrecta(v.preguntas);
  const problemas: string[] = [];
  if (v.piezas.length === 0) problemas.push("La versión no tiene piezas");
  const sinClave = v.piezas.filter((p) => p.esperado !== "G" && p.esperado !== "B").map((p) => p.numero);
  if (sinClave.length) problemas.push(`Piezas sin clave G/B: ${sinClave.join(", ")}`);
  if (Math.abs(v.pesoFisico + v.pesoTeorico - 1) > 1e-9) problemas.push("Los pesos físico y teórico deben sumar 100 %");
  if (v.teoriaMax <= 0) problemas.push("La teoría máxima debe ser mayor a 0");
  if (v.modoTeoria === "POR_PREGUNTA" && v.preguntas.some((q) => q.puntaje === null)) {
    problemas.push("Modo de teoría POR_PREGUNTA: todas las preguntas necesitan puntaje");
  }
  if (v.modoTeoria === "POR_PREGUNTA" && sinRespuesta.length) {
    problemas.push(
      `Modo de teoría POR_PREGUNTA: preguntas cerradas sin respuesta correcta: ${listaPreguntas(sinRespuesta)}`,
    );
  }
  return problemas;
}

export async function publicarVersion(actor: Actor, versionId: string, opts: OpcionesPublicar = {}) {
  requirePermission(actor, "examen:editar");
  const ahora = opts.ahora ?? new Date();
  const vigenteDesde = opts.vigenteDesde ?? ahora;
  const motivo = opts.motivo?.trim() ?? "";

  return db().$transaction(async (tx) => {
    const v = await tx.examenVersion.findUnique({ where: { id: versionId }, include: { examen: true } });
    if (!v) throw new NotFoundError("La versión");
    if (v.estado !== "BORRADOR") throw new AppError("VERSION_NO_BORRADOR", "Solo se puede publicar un borrador");
    if (v.version > 1 && !motivo) throw new AppError("MOTIVO_REQUERIDO", "El motivo del cambio es obligatorio");
    if (vigenteDesde.getTime() > ahora.getTime()) {
      throw new AppError("VIGENCIA_FUTURA", "La vigencia no puede estar en el futuro");
    }
    const problemas = await validarPublicable(versionId, tx);
    if (problemas.length) throw new AppError("VERSION_INCOMPLETA", problemas.join(". "), 400, { problemas });
    const sinRespuesta = preguntasSinRespuestaCorrecta(
      await tx.pregunta.findMany({ where: { versionId }, include: { flechas: true }, orderBy: { orden: "asc" } }),
    );
    if (sinRespuesta.length && !opts.aceptarSinRespuestaCorrecta) {
      throw new AppError(
        "PREGUNTAS_SIN_RESPUESTA",
        `Hay ${sinRespuesta.length} pregunta(s) cerradas sin respuesta correcta (${listaPreguntas(sinRespuesta)}). ` +
          "La pantalla de calificar no podrá marcarlas como correctas o incorrectas. Regístralas o confirma que quieres publicar así.",
        400,
        { preguntas: sinRespuesta },
      );
    }

    const ultimoIntento = await tx.intento.findFirst({
      where: { examenId: v.examenId },
      orderBy: { fechaAplicacion: "desc" },
      select: { fechaAplicacion: true },
    });
    if (ultimoIntento && vigenteDesde.getTime() <= ultimoIntento.fechaAplicacion.getTime()) {
      throw new AppError(
        "VIGENCIA_ANTERIOR_A_INTENTO",
        `La vigencia debe ser posterior al último intento aplicado (${formatFechaHora(ultimoIntento.fechaAplicacion)})`,
        400,
        { ultimoIntento: ultimoIntento.fechaAplicacion.toISOString() },
      );
    }
    const anterior = await tx.examenVersion.findFirst({ where: { examenId: v.examenId, estado: "PUBLICADA" } });
    if (anterior?.vigenteDesde && vigenteDesde.getTime() <= anterior.vigenteDesde.getTime()) {
      throw new AppError(
        "VIGENCIA_ANTERIOR_A_VERSION",
        `La vigencia debe ser posterior a la de v${anterior.version} (${formatFechaHora(anterior.vigenteDesde)})`,
      );
    }

    if (anterior) {
      await tx.examenVersion.update({
        where: { id: anterior.id },
        data: { estado: "REEMPLAZADA", vigenteHasta: vigenteDesde },
      });
    }
    const publicada = await tx.examenVersion.update({
      where: { id: v.id },
      data: {
        estado: "PUBLICADA",
        vigenteDesde,
        motivoCambio: motivo || null,
        publicadoPorId: actor.id,
        publicadoEn: ahora,
      },
    });
    await registrarAudit(tx, actor, {
      accion: "PUBLICAR",
      entidad: "ExamenVersion",
      entidadId: v.id,
      resumen:
        `Publicó ${v.examen.nombre} v${v.version}${motivo ? `: ${motivo}` : ""}` +
        (sinRespuesta.length
          ? ` — ACEPTÓ publicar con ${sinRespuesta.length} pregunta(s) cerradas sin respuesta correcta (${listaPreguntas(sinRespuesta)})`
          : ""),
      despues: {
        vigenteDesde: vigenteDesde.toISOString(),
        reemplaza: anterior?.id ?? null,
        preguntasSinRespuestaCorrecta: sinRespuesta.map((p) => p.orden),
      },
    });
    return publicada;
  });
}

export function cambioReciente(v: { version: number; vigenteDesde: Date | null }, dias: number, ahora = new Date()) {
  return v.version > 1 && !!v.vigenteDesde && ahora.getTime() - v.vigenteDesde.getTime() < dias * 86_400_000;
}
