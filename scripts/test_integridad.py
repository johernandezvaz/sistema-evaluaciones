"""Prueba de prisma/sql/integridad.sql contra el esquema (SQLite en memoria).

Uso:
  npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > tmp/init.sql
  python -I -X utf8 scripts/test_integridad.py tmp/init.sql prisma/sql/integridad.sql

Se portará a Vitest en la fase de auth/permisos."""
import sqlite3, sys

db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript(open(sys.argv[1], encoding='utf-8').read())
db.executescript(open(sys.argv[2], encoding='utf-8').read())
fails = 0


def ok(n):
    print('OK   ', n)


def run(sql, *a):
    db.execute(sql, a)


def expect_fail(n, sql, *a):
    global fails
    try:
        db.execute(sql, a)
        print('FALLA (no bloqueó)', n)
        fails += 1
    except sqlite3.DatabaseError as e:
        print('OK   ', n, '->', str(e).encode('ascii', 'replace').decode())


def expect_ok(n, sql, *a):
    global fails
    try:
        db.execute(sql, a)
        ok(n)
    except sqlite3.DatabaseError as e:
        print('FALLA (bloqueó)', n, '->', e)
        fails += 1


NOW = 'CURRENT_TIMESTAMP'
run("INSERT INTO Usuario(id,email,nombre,passwordHash,rol) VALUES('u','a@x','Admin','h','ADMIN')")
run("INSERT INTO Area(id,nombre) VALUES('ar','PINTURA')")
run("INSERT INTO Turno(id,nombre) VALUES('t','1ER')")
for pid, num in (('p1', '1405'), ('p2', '1074')):
    run(f"INSERT INTO Persona(id,numeroEmpleado,nombre,areaId,turnoId,actualizadoEn) VALUES('{pid}','{num}','X','ar','t',{NOW})")
run("INSERT INTO Modelo(id,slug,nombre,grupo) VALUES('m','highland','HIGHLAND','ENSAMBLES')")
run("INSERT INTO Examen(id,modeloId,nombre) VALUES('e','m','Highland')")
run("INSERT INTO Examen(id,modeloId,variante,nombre) VALUES('e2','m','anual','Highland anual')")

print('\n── Versiones')
run("INSERT INTO ExamenVersion(id,examenId,version) VALUES('v1','e',1)")
expect_ok('editar clave en BORRADOR', "INSERT INTO PiezaClave(id,versionId,orden,numero,esperado) VALUES('k7','v1',7,7,'G')")
run("UPDATE ExamenVersion SET estado='PUBLICADA', vigenteDesde='2026-01-01' WHERE id='v1'")
expect_fail('cambiar clave de versión publicada', "UPDATE PiezaClave SET esperado='B' WHERE id='k7'")
expect_fail('cambiar pesos de versión publicada', "UPDATE ExamenVersion SET pesoFisico=0.8 WHERE id='v1'")
run("INSERT INTO ExamenVersion(id,examenId,version,basadaEnId) VALUES('v2','e',2,'v1')")
expect_fail('dos versiones PUBLICADAS', "UPDATE ExamenVersion SET estado='PUBLICADA' WHERE id='v2'")

print('\n── Asignaciones')
run("INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a1','p1','e','ABC234',1,'u','2026-12-01')")
expect_fail('segunda asignación activa persona×examen', "INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a1b','p1','e','ZZZ999',1,'u','2026-12-01')")
expect_fail('código repetido entre activas', "INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a9','p2','e','ABC234',1,'u','2026-12-01')")
expect_ok('misma persona, otro examen', "INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a2','p1','e2','KLM456',1,'u','2026-12-01')")
expect_fail('cambiar persona de una asignación', "UPDATE Asignacion SET personaId='p2' WHERE id='a1'")
expect_fail('PENDIENTE -> COMPLETADA directo', "UPDATE Asignacion SET estado='COMPLETADA' WHERE id='a1'")
expect_fail('borrar asignación', "DELETE FROM Asignacion WHERE id='a2'")

print('\n── Intento desde asignación')
expect_fail('intento con otro empleado que la asignación',
            f"INSERT INTO Intento(id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,modo,actualizadoEn) VALUES('ix','p2','m','e','v1','a1','2026-03-01','DISPOSITIVO',{NOW})")
expect_ok('abrir asignación: intento EN_CURSO',
          f"INSERT INTO Intento(id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,iniciadoEn,modo,ronda,actualizadoEn) VALUES('i1','p1','m','e','v1','a1','2026-03-01','2026-03-01','DISPOSITIVO',1,{NOW})")
run("UPDATE Asignacion SET estado='EN_CURSO', iniciadaEn='2026-03-01', modoApertura='DISPOSITIVO' WHERE id='a1'")
expect_fail('segundo intento para la misma asignación',
            f"INSERT INTO Intento(id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,modo,actualizadoEn) VALUES('i1b','p1','m','e','v1','a1','2026-03-01','DISPOSITIVO',{NOW})")
expect_ok('guardar respuesta de pieza', "INSERT INTO RespuestaPieza(id,intentoId,numero,respuesta,esperado,correcta) VALUES('r7','i1',7,'G','G',1)")
expect_fail('cambiar respuesta ya enviada (kiosco)', "UPDATE RespuestaPieza SET respuesta='B' WHERE id='r7'")

print('\n── Publicar versión nueva con intento EN_CURSO')
run("UPDATE ExamenVersion SET estado='REEMPLAZADA', vigenteHasta='2026-03-02' WHERE id='v1'")
run("INSERT INTO PiezaClave(id,versionId,orden,numero,esperado) VALUES('k7b','v2',7,7,'B')")
run("UPDATE ExamenVersion SET estado='PUBLICADA', vigenteDesde='2026-03-02', motivoCambio='Pieza 7 cambiada' WHERE id='v2'")
expect_fail('mover intento EN_CURSO (kiosco) a la versión nueva', "UPDATE Intento SET versionId='v2' WHERE id='i1'")

print('\n── Terminar e inmutabilidad')
run("UPDATE Intento SET estado='FINALIZADO', aciertos=28, errores=2, totalPiezas=30, calificacion=0.94, resultado='KAPPA_90', enviadoEn='2026-03-01' WHERE id='i1'")
run("UPDATE Asignacion SET estado='COMPLETADA', completadaEn='2026-03-01' WHERE id='a1'")
expect_fail('cambiar personaId de intento finalizado', "UPDATE Intento SET personaId='p2' WHERE id='i1'")
expect_fail('cambiar examenId de intento finalizado', "UPDATE Intento SET examenId='e2' WHERE id='i1'")
expect_fail('desligar asignación de intento finalizado', "UPDATE Intento SET asignacionId=NULL WHERE id='i1'")
expect_fail('recalcular intento finalizado', "UPDATE Intento SET calificacion=0.91 WHERE id='i1'")
expect_fail('insertar pieza con intento finalizado', "INSERT INTO RespuestaPieza(id,intentoId,numero,respuesta,esperado,correcta) VALUES('r8','i1',8,'G','G',1)")
expect_fail('reabrir asignación COMPLETADA', "UPDATE Asignacion SET estado='EN_CURSO' WHERE id='a1'")
expect_fail('borrar intento', "DELETE FROM Intento WHERE id='i1'")

print('\n── Repetir: nueva asignación → nuevo intento, ronda 2')
expect_ok('nueva asignación tras completar', "INSERT INTO Asignacion(id,personaId,examenId,codigo,ronda,asignadoPorId,venceEn) VALUES('a3','p1','e','ABC234',2,'u','2026-12-01')")
run(f"INSERT INTO Intento(id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,iniciadoEn,modo,ronda,actualizadoEn) VALUES('i2','p1','m','e','v2','a3','2026-03-05','2026-03-05','KIOSCO',2,{NOW})")
prev = db.execute("SELECT versionId,calificacion,aciertos,ronda,estado FROM Intento WHERE id='i1'").fetchone()
print('OK    intento anterior intacto ->', prev) if prev == ('v1', 0.94, 28, 1, 'FINALIZADO') else print('FALLA intento anterior cambió', prev)

print('\n── Teóricas y práctica')
run("INSERT INTO ExamenVersion(id,examenId,version) VALUES('v3','e2',1)")
run("INSERT INTO Pregunta(id,versionId,orden,tipo,texto) VALUES('q1','v3',1,'TEXTO_ABIERTO','Menciona 3 defectos')")
run("UPDATE ExamenVersion SET estado='PUBLICADA', vigenteDesde='2026-01-01' WHERE id='v3'")
run(f"INSERT INTO Intento(id,personaId,modeloId,examenId,versionId,asignacionId,fechaAplicacion,modo,actualizadoEn) VALUES('i3','p1','m','e2','v3','a2','2026-03-01','KIOSCO',{NOW})")
run("INSERT INTO RespuestaTeorica(id,intentoId,preguntaId,valor) VALUES('t1','i3','q1','[\"rebaba\",\"raya\",\"mancha\"]')")
run("INSERT INTO PracticaDia(id,intentoId,dia,fecha) VALUES('d1','i3',1,'2026-03-01')")
run("UPDATE Intento SET estado='PENDIENTE_CALIFICAR' WHERE id='i3'")
expect_ok('calificar abierta en PENDIENTE_CALIFICAR', "UPDATE RespuestaTeorica SET puntos=2, calificadaPorId='u' WHERE id='t1'")
expect_fail('cambiar lo que contestó el empleado', "UPDATE RespuestaTeorica SET valor='[]' WHERE id='t1'")
expect_fail('agregar respuesta teórica tras enviar', "INSERT INTO RespuestaTeorica(id,intentoId,preguntaId,valor) VALUES('t2','i3','q1','x')")
run("UPDATE Intento SET estado='FINALIZADO', calificacion=0.9 WHERE id='i3'")
expect_fail('recalificar abierta con intento finalizado', "UPDATE RespuestaTeorica SET puntos=3 WHERE id='t1'")
expect_fail('borrar respuesta teórica finalizada', "DELETE FROM RespuestaTeorica WHERE id='t1'")
expect_fail('insertar práctica con intento finalizado', "INSERT INTO PracticaDia(id,intentoId,dia,fecha) VALUES('d2','i3',2,'2026-03-02')")
expect_fail('editar práctica con intento finalizado', "UPDATE PracticaDia SET fecha='2026-01-01' WHERE id='d1'")
expect_ok('anular intento finalizado', "UPDATE Intento SET estado='ANULADO', anuladoMotivo='error de captura' WHERE id='i3'")
expect_fail('des-anular', "UPDATE Intento SET estado='FINALIZADO' WHERE id='i3'")

print('\n── Captura en papel EN_CURSO (corregible antes de enviar)')
run(f"INSERT INTO Intento(id,personaId,modeloId,examenId,versionId,fechaAplicacion,modo,actualizadoEn) VALUES('ip','p2','m','e','v1','2026-02-20','CAPTURA_PAPEL',{NOW})")
run("INSERT INTO RespuestaPieza(id,intentoId,numero,respuesta,esperado,correcta) VALUES('rp','ip',7,'B','G',0)")
expect_ok('corregir pieza capturada en papel', "UPDATE RespuestaPieza SET respuesta='G', correcta=1 WHERE id='rp'")
expect_ok('corregir empleado en captura en papel', "UPDATE Intento SET personaId='p1' WHERE id='ip'")

print('\n── AuditLog')
run("INSERT INTO AuditLog(id,usuarioNombre,rol,accion,entidad) VALUES('l','x','ADMIN','CREAR','Examen')")
expect_fail('editar AuditLog', "UPDATE AuditLog SET accion='X'")
expect_fail('borrar AuditLog', "DELETE FROM AuditLog")

print('\nResultado:', 'TODO OK' if fails == 0 else f'{fails} FALLAS')
sys.exit(1 if fails else 0)
