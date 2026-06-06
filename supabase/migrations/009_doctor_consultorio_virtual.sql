-- Permite marcar el consultorio principal de un doctor como virtual
ALTER TABLE doctores ADD COLUMN IF NOT EXISTS consultorio_virtual boolean DEFAULT false;
