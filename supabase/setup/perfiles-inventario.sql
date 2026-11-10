-- Tras crear las tres cuentas en Authentication, copia este archivo al SQL Editor.
-- Sustituye los UUID, nombres y usuarios en el editor; no guardes datos reales aquí.
-- Los usuarios deben tener de 3 a 32 caracteres: minúsculas, números, punto, guion o guion bajo.
-- No incluyas correos ni contraseñas en este archivo.
-- Cada username debe corresponder al identificador interno con que se creó en Auth:
-- encode(convert_to(username, 'UTF8'), 'hex') || '@belleza.invalid'.
begin;

insert into public.profiles (id, full_name, role, is_active, username)
values
  ('UUID_ADMIN'::uuid, 'Nombre administrador', 'admin', true, 'admin'),
  ('UUID_PERSONAL_1'::uuid, 'Nombre operador 1', 'personal', true, 'operador1'),
  ('UUID_PERSONAL_2'::uuid, 'Nombre operador 2', 'personal', true, 'operador2');

commit;
