-- Link de Google Meet para citas virtuales (ingresado manualmente)
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS meet_link text;
