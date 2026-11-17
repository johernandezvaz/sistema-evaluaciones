/**
 * Triggers e índices parciales probados con SQL directo (sin la capa de servicio): son la red de
 * seguridad si alguien escribe a la base por fuera de lib/services. Port de scripts/test_integridad.py.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../../scripts/sqlite";

let d: DatabaseSync;
const run = (sql: string) => d.exec(sql);
const bloquea = (sql: string, msg?: RegExp) => expect(() => d.exec(sql)).toThrow(msg);
const permite = (sql: string) => expect(() => d.exec(sql)).not.toThrow();
const NOW = "CURRENT_TIMESTAMP";
const intento = (cols: string, vals: string) => `INSERT INTO Intento(${cols},actualizadoEn) VALUES(${vals},${NOW})`;

beforeAll(() => {
  d = openDb(process.env.TEST_DB_FILE!);
  d.exec("PRAGMA foreign_keys=ON");
  run("INSERT INTO Usuario(id,email,nombre,passwordHash,rol) VALUES('u','a@x','Admin','h','ADMIN')");
  run("INSERT INTO Area(id,nombre) VALUES('ar','PINTURA')");
  run("INSERT INTO Turno(id,nombre) VALUES('t','1ER')");
  for (const [pid, num] of [
    ["p1", "1405"],
    ["p2", "1074"],
  ]) {
    run(
      `INSERT INTO Persona(id,numeroEmpleado,nombre,areaId,turnoId,actualizadoEn) VALUES('${pid}','${num}','X','ar','t',${NOW})`,
    );
  }
  run("INSERT INTO Modelo(id,slug,nombre,grupo) VALUES('m','highland','HIGHLAND','ENSAMBLES')");
  run("INSERT INTO Modelo(id,slug,nombre,grupo) VALUES('m2','18rm','18RM','MOLDEO')");
  run("INSERT INTO Examen(id,modeloId,nombre) VALUES('e','m','Highland')");
  run("INSERT INTO Examen(id,modeloId,variante,nombre) VALUES('e2','m','anual','Highland anual')");
  run("INSERT INTO Examen(id,modeloId,nombre) VALUES('e18','m2','18RM')");
});

describe("integridad (SQL directo)", () => {
  it("versiones: clave editable en BORRADOR, inmutable al publicar, una sola PUBLICADA", () => {
    run("INSERT INTO ExamenVersion(id,examenId,version) VALUES('v1','e',1)");
    permite("INSERT INTO PiezaClave(id,versionId,orden,numero,esperado) VALUES('k7','v1',7,7,'G')");
    run("UPDATE ExamenVersion SET estado='PUBLICADA', vigenteDesde='2026-01-01' WHERE id='v1'");
    bloquea("UPDATE PiezaClave SET esperado='B' WHERE id='k7'", /BORRADOR/);
    bloquea("INSERT INTO PiezaClave(id,versionId,orden,numero,esperado) VALUES('k8','v1',8,8,'G')", /BORRADOR/);
    bloquea("DELETE FROM PiezaClave WHERE id='k7'", /BORRADOR/);
    bloquea("UPDATE ExamenVersion SET pesoFisico=0.8 WHERE id='v1'", /no se puede modificar/);
    bloquea("DELETE FROM ExamenVersion WHERE id='v1'");
    run("INSERT INTO ExamenVersion(id,examenId,version,basadaEnId) VALUES('v2','e',2,'v1')");
    bloquea("UPDATE ExamenVersion SET estado='PUBLICADA', vigenteDesde='2026-02-01' WHERE id='v2'", /UNIQUE/);
    bloquea("UPDATE ExamenVersion SET estado='PUBLICADA' WHERE id='v2'"); // sin vigenteDesde
  });

  it("asignaciones: una activa por persona×examen, código único entre activas, transiciones", () => {
    run(
      "INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a1','p1','e','ABC234',1,'u','2026-12-01')",
    );
    bloquea(
      "INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a1b','p1','e','ZZZ999',1,'u','2026-12-01')",
      /UNIQUE/,
    );
    bloquea(
      "INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a9','p2','e','ABC234',1,'u','2026-12-01')",
      /UNIQUE/,
    );
    permite(
      "INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a2','p1','e2','KLM456',1,'u','2026-12-01')",
    );
    bloquea("UPDATE Asignacion SET personaId='p2' WHERE id='a1'");
    bloquea("UPDATE Asignacion SET estado='COMPLETADA' WHERE id='a1'", /Transición/);
    bloquea("DELETE FROM Asignacion WHERE id='a2'");
  });

  it("intento desde asignación: mismo empleado, uno por asignación, respuestas definitivas", () => {
    bloquea(
      intento(
        "id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,modo",
        "'ix','p2','m','e','v1','a1','2026-03-01','DISPOSITIVO'",
      ),
      /asignación/,
    );
    permite(
      intento(
        "id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,iniciadoEn,modo,ronda",
        "'i1','p1','m','e','v1','a1','2026-03-01','2026-03-01','DISPOSITIVO',1",
      ),
    );
    // Con la asignación aún PENDIENTE el kiosco no acepta respuestas.
    bloquea(
      "INSERT INTO RespuestaPieza(id,intentoId,numero,respuesta,esperado,correcta) VALUES('r0','i1',7,'G','G',1)",
      /ya no está en curso/,
    );
    run("UPDATE Asignacion SET estado='EN_CURSO', iniciadaEn='2026-03-01', modoApertura='DISPOSITIVO' WHERE id='a1'");
    bloquea(
      intento(
        "id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,modo",
        "'i1b','p1','m','e','v1','a1','2026-03-01','DISPOSITIVO'",
      ),
      /UNIQUE/,
    );
    permite(
      "INSERT INTO RespuestaPieza(id,intentoId,numero,respuesta,esperado,correcta) VALUES('r7','i1',7,'G','G',1)",
    );
    bloquea("UPDATE RespuestaPieza SET respuesta='B' WHERE id='r7'", /ya fue enviada/);
    bloquea("DELETE FROM RespuestaPieza WHERE id='r7'");
  });

  it("coherencia: versión de otro examen, examen de otro modelo y versión BORRADOR se rechazan", () => {
    run("INSERT INTO ExamenVersion(id,examenId,version) VALUES('v18','e18',1)");
    run("INSERT INTO PiezaClave(id,versionId,orden,numero,esperado) VALUES('k18','v18',1,1,'G')");
    run("UPDATE ExamenVersion SET estado='PUBLICADA', vigenteDesde='2026-01-01' WHERE id='v18'");
    const papel = (id: string, modelo: string, examen: string, version: string) =>
      intento(
        "id,personaId,modeloId,examenId,versionId,fechaAplicacion,modo",
        `'${id}','p2','${modelo}','${examen}','${version}','2026-02-01','CAPTURA_PAPEL'`,
      );
    bloquea(papel("c1", "m", "e", "v18"), /no pertenece/); // versión de 18RM en examen Highland
    bloquea(papel("c2", "m", "e18", "v18"), /no pertenece/); // examen 18RM con modelo Highland
    bloquea(papel("c3", "m", "e", "v2"), /BORRADOR/); // v2 sigue en BORRADOR
    permite(papel("c4", "m2", "e18", "v18"));
    bloquea("UPDATE Intento SET versionId='v1' WHERE id='c4'", /no pertenece/); // al editar también se valida
  });

  it("publicar no puede ser retroactivo respecto a intentos ya aplicados", () => {
    // i1 se aplicó el 2026-03-01 → v2 no puede ser vigente desde antes.
    run("UPDATE ExamenVersion SET estado='REEMPLAZADA', vigenteHasta='2026-02-15' WHERE id='v1'");
    bloquea(
      "UPDATE ExamenVersion SET estado='PUBLICADA', vigenteDesde='2026-02-15', motivoCambio='x' WHERE id='v2'",
      /anterior al último intento/,
    );
  });

  it("publicar versión nueva con un intento EN_CURSO no lo mueve de versión", () => {
    run("INSERT INTO PiezaClave(id,versionId,orden,numero,esperado) VALUES('k7b','v2',7,7,'B')");
    permite(
      "UPDATE ExamenVersion SET estado='PUBLICADA', vigenteDesde='2026-03-02', motivoCambio='Pieza 7 cambiada' WHERE id='v2'",
    );
    bloquea("UPDATE Intento SET versionId='v2' WHERE id='i1'", /No se puede cambiar/);
  });

  it("terminar: identidad, parte física y calificación inmutables; no se borra", () => {
    run(
      "UPDATE Intento SET estado='PENDIENTE_CALIFICAR', aciertos=28, errores=2, totalPiezas=30, pctFisico=0.9333, enviadoEn='2026-03-01' WHERE id='i1'",
    );
    bloquea("UPDATE Intento SET aciertos=29 WHERE id='i1'", /parte física/);
    bloquea("UPDATE Intento SET totalPiezas=35 WHERE id='i1'", /parte física/);
    permite("UPDATE Intento SET teoriaManual=10 WHERE id='i1'"); // en PENDIENTE_CALIFICAR sí se captura teoría
    run("UPDATE Intento SET estado='FINALIZADO', calificacion=0.94, resultado='KAPPA_90' WHERE id='i1'");
    run("UPDATE Asignacion SET estado='COMPLETADA', completadaEn='2026-03-01' WHERE id='a1'");
    bloquea("UPDATE Intento SET personaId='p2' WHERE id='i1'");
    bloquea("UPDATE Intento SET examenId='e2' WHERE id='i1'");
    bloquea("UPDATE Intento SET asignacionId=NULL WHERE id='i1'");
    bloquea("UPDATE Intento SET calificacion=0.91 WHERE id='i1'");
    bloquea("UPDATE Intento SET ronda=5 WHERE id='i1'");
    bloquea(
      "INSERT INTO RespuestaPieza(id,intentoId,numero,respuesta,esperado,correcta) VALUES('r8','i1',8,'G','G',1)",
    );
    bloquea("UPDATE Asignacion SET estado='EN_CURSO' WHERE id='a1'");
    bloquea("DELETE FROM Intento WHERE id='i1'");
    bloquea("UPDATE Intento SET estado='EN_CURSO' WHERE id='i1'", /Transición/);
  });

  it("repetir: nueva asignación → nuevo intento; el anterior queda intacto", () => {
    permite(
      "INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a3','p1','e','ABC234',2,'u','2026-12-01')",
    );
    run(
      intento(
        "id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,iniciadoEn,modo,ronda",
        "'i2','p1','m','e','v2','a3','2026-03-05','2026-03-05','KIOSCO',2",
      ),
    );
    const prev = d.prepare("SELECT versionId,calificacion,aciertos,ronda,estado FROM Intento WHERE id='i1'").get();
    expect(prev).toEqual({ versionId: "v1", calificacion: 0.94, aciertos: 28, ronda: 1, estado: "FINALIZADO" });
  });

  it("kiosco: con la asignación VENCIDA ya no entran respuestas", () => {
    run("UPDATE Asignacion SET estado='EN_CURSO' WHERE id='a3'");
    permite(
      "INSERT INTO RespuestaPieza(id,intentoId,numero,respuesta,esperado,correcta) VALUES('r9','i2',7,'B','B',1)",
    );
    run("UPDATE Asignacion SET estado='VENCIDA', vencidaEn='2026-03-05' WHERE id='a3'");
    bloquea(
      "INSERT INTO RespuestaPieza(id,intentoId,numero,respuesta,esperado,correcta) VALUES('r10','i2',8,'B','B',1)",
      /ya no está en curso/,
    );
    bloquea("UPDATE Asignacion SET estado='EN_CURSO' WHERE id='a3'");
  });

  it("teóricas y práctica: valor definitivo, calificación solo en PENDIENTE_CALIFICAR", () => {
    run("INSERT INTO ExamenVersion(id,examenId,version) VALUES('v3','e2',1)");
    run(
      "INSERT INTO Pregunta(id,versionId,orden,tipo,texto) VALUES('q1','v3',1,'TEXTO_ABIERTO','Menciona 3 defectos')",
    );
    run("UPDATE ExamenVersion SET estado='PUBLICADA', vigenteDesde='2026-01-01' WHERE id='v3'");
    bloquea("INSERT INTO Pregunta(id,versionId,orden,tipo,texto) VALUES('q2','v3',2,'SI_NO','x')", /BORRADOR/);
    run(
      intento(
        "id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,modo",
        "'i3','p1','m','e2','v3','a2','2026-03-01','KIOSCO'",
      ),
    );
    run("UPDATE Asignacion SET estado='EN_CURSO' WHERE id='a2'");
    run(
      `INSERT INTO RespuestaTeorica(id,intentoId,preguntaId,valor) VALUES('t1','i3','q1','["rebaba","raya","mancha"]')`,
    );
    run("INSERT INTO PracticaDia(id,intentoId,dia,fecha) VALUES('d1','i3',1,'2026-03-01')");
    run("UPDATE Intento SET estado='PENDIENTE_CALIFICAR' WHERE id='i3'");
    permite("UPDATE RespuestaTeorica SET puntos=2, calificadaPorId='u' WHERE id='t1'");
    bloquea("UPDATE RespuestaTeorica SET valor='[]' WHERE id='t1'");
    bloquea("INSERT INTO RespuestaTeorica(id,intentoId,preguntaId,valor) VALUES('t2','i3','q1','x')");
    run("UPDATE Intento SET estado='FINALIZADO', calificacion=0.9 WHERE id='i3'");
    bloquea("UPDATE RespuestaTeorica SET puntos=3 WHERE id='t1'");
    bloquea("DELETE FROM RespuestaTeorica WHERE id='t1'");
    bloquea("INSERT INTO PracticaDia(id,intentoId,dia,fecha) VALUES('d2','i3',2,'2026-03-02')");
    bloquea("UPDATE PracticaDia SET fecha='2026-01-01' WHERE id='d1'");
    permite("UPDATE Intento SET estado='ANULADO', anuladoMotivo='error de captura' WHERE id='i3'");
    bloquea("UPDATE Intento SET estado='FINALIZADO' WHERE id='i3'");
    bloquea("UPDATE Intento SET anuladoMotivo='otro' WHERE id='i3'");
  });

  it("captura en papel EN_CURSO es corregible antes de enviarla", () => {
    run(
      intento(
        "id,personaId,modeloId,examenId,versionId,fechaAplicacion,modo",
        "'ip','p2','m','e','v1','2026-02-20','CAPTURA_PAPEL'",
      ),
    );
    run("INSERT INTO RespuestaPieza(id,intentoId,numero,respuesta,esperado,correcta) VALUES('rp','ip',7,'B','G',0)");
    permite("UPDATE RespuestaPieza SET respuesta='G', correcta=1 WHERE id='rp'");
    permite("UPDATE Intento SET personaId='p1' WHERE id='ip'");
  });

  it("EN_CURSO → CANCELADA solo con el intento ya ANULADO y con motivo", () => {
    // a2 sigue EN_CURSO y su intento i3 se anuló en la prueba anterior de teóricas.
    bloquea("UPDATE Asignacion SET estado='CANCELADA' WHERE id='a2'", /Transición/); // sin motivo
    permite("UPDATE Asignacion SET estado='CANCELADA', motivoCancelacion='error de captura' WHERE id='a2'");
    // Con el intento vivo no se puede cancelar una asignación en curso.
    run(
      "INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a4','p2','e','QRS567',1,'u','2026-12-01')",
    );
    run(
      intento(
        "id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,iniciadoEn,modo",
        "'i4','p2','m','e','v2','a4','2026-03-06','2026-03-06','KIOSCO'",
      ),
    );
    run("UPDATE Asignacion SET estado='EN_CURSO' WHERE id='a4'");
    bloquea("UPDATE Asignacion SET estado='CANCELADA', motivoCancelacion='x' WHERE id='a4'", /Transición/);
    run("UPDATE Intento SET estado='ANULADO', anuladoMotivo='x' WHERE id='i4'");
    permite("UPDATE Asignacion SET estado='CANCELADA', motivoCancelacion='x' WHERE id='a4'");
    bloquea("UPDATE Asignacion SET estado='EN_CURSO' WHERE id='a4'");
  });

  it("AuditLog es de solo inserción", () => {
    run("INSERT INTO AuditLog(id,usuarioNombre,rol,accion,entidad) VALUES('l','x','ADMIN','CREAR','Examen')");
    bloquea("UPDATE AuditLog SET accion='X'", /solo inserción/);
    bloquea("DELETE FROM AuditLog", /solo inserción/);
  });
});
