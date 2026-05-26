"use client";

import { useState } from "react";
import { CalendarDays, MapPin, Plus, UserPlus, Zap, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import HorariosSheet from "@/app/doctores/horarios-sheet";
import SedesSheet from "@/app/doctores/sedes-sheet";
import ConsultorioSheet from "./consultorio-sheet";
import type { Doctor } from "@/app/doctores/types";
import type { ConsultorioConfig } from "@/app/configuracion/actions";

interface Props {
  doctorId: string;
  doctorNombre: string;
  consultorioConfig: ConsultorioConfig | null;
}

export default function DoctorConfig({ doctorId, doctorNombre, consultorioConfig }: Props) {
  const [horariosOpen, setHorariosOpen] = useState(false);
  const [sedesOpen, setSedesOpen] = useState(false);
  const [consultorioOpen, setConsultorioOpen] = useState(false);

  const doctor = { id: doctorId, nombre: doctorNombre } as Doctor;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Link href="/doctor/agenda">
          <Button className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Agendar cita
          </Button>
        </Link>
        <Link href="/pacientes">
          <Button variant="outline" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Crear paciente
          </Button>
        </Link>
        <Link href="/doctor/adelantar">
          <Button className="gap-2 bg-teal-600 hover:bg-teal-700 text-white shadow-sm">
            <Zap className="h-4 w-4" />
            Adelantar citas
          </Button>
        </Link>
        <Button variant="outline" className="gap-2" onClick={() => setHorariosOpen(true)}>
          <CalendarDays className="h-4 w-4" />
          Mi horario
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => setSedesOpen(true)}>
          <MapPin className="h-4 w-4" />
          Consultorio extra
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => setConsultorioOpen(true)}>
          <Building2 className="h-4 w-4" />
          Configurar consultorio
        </Button>
      </div>

      <HorariosSheet
        doctor={horariosOpen ? doctor : null}
        onClose={() => setHorariosOpen(false)}
      />
      <SedesSheet
        doctor={sedesOpen ? doctor : null}
        onClose={() => setSedesOpen(false)}
      />
      <ConsultorioSheet
        open={consultorioOpen}
        onClose={() => setConsultorioOpen(false)}
        config={consultorioConfig}
      />
    </>
  );
}
