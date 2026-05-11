CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price_cents INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  service_id INTEGER REFERENCES services(id),
  total_cents INTEGER NOT NULL DEFAULT 0,
  total_duration_minutes INTEGER NOT NULL DEFAULT 0,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'cancelado', 'concluido')),
  source TEXT NOT NULL DEFAULT 'cliente' CHECK (source IN ('cliente', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_date, booking_time)
);

CREATE TABLE IF NOT EXISTS booking_services (
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id),
  price_cents INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  PRIMARY KEY (booking_id, service_id)
);

INSERT INTO services (name, description, duration_minutes, price_cents)
VALUES
  ('Corte Feminino',     'Lavagem, corte e finalização para todos os comprimentos.',                60, 4000),
  ('Corte Masculino',    'Corte masculino moderno ou clássico, com finalização.',                   30, 2500),
  ('Coloração',          'Tintura completa ou retoque de raiz com produtos profissionais.',        120, 8000),
  ('Cronograma 4 sessões','Pacote de 4 sessões de hidratação, nutrição e reconstrução.',           90, 15000),
  ('Escova',             'Escova modelada para o dia a dia ou ocasiões especiais.',                 40, 3000),
  ('Escova + Hidratação','Hidratação profunda combinada com escova de finalização.',                60, 5000)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      duration_minutes = EXCLUDED.duration_minutes,
      price_cents = EXCLUDED.price_cents;
