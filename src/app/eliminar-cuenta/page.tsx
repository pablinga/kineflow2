import { LegalPage } from "@/components/layout/LegalPage";

const updatedAt = "27 de octubre de 2026";

// URL pública de baja de cuenta que pide Google Play para la app de Android.
export default function DeleteAccountPage() {
  return (
    <LegalPage
      intro="Podés pedir que eliminemos tu cuenta de KineFlow y los datos asociados a ella, desde la web o desde la app."
      sections={[
        {
          title: "1. Cómo pedirlo",
          body: [
            "Escribí a contacto@kineflow.ar desde el correo con el que te registraste, con el asunto \"Eliminar mi cuenta\".",
            "Si ya no tenés acceso a ese correo, indicá el nombre de la cuenta o de la clínica y te vamos a pedir que confirmes que sos el titular.",
          ],
        },
        {
          title: "2. Antes de pedirlo",
          body: [
            "Si tenés una suscripción activa, cancelala desde Plan / Suscripción para que no se generen nuevos cobros.",
            "Descargá o resguardá la información que necesites conservar. Como profesional de la salud, puede que tengas la obligación legal de conservar las historias clínicas de tus pacientes.",
          ],
        },
        {
          title: "3. Qué se elimina",
          body: [
            "La cuenta y su acceso, y los datos cargados en ella: pacientes, turnos, evoluciones, evaluaciones, tratamientos, cobros y archivos adjuntos.",
            "Si la cuenta es la de una clínica, se elimina el espacio de la clínica. Las cuentas de los profesionales del equipo son independientes y no se eliminan.",
          ],
        },
        {
          title: "4. Qué se conserva",
          body: "Los registros de pagos y facturación, y los datos que debamos conservar por obligación legal o para resolver reclamos, durante el plazo que corresponda según la Política de Privacidad.",
        },
        {
          title: "5. Plazo",
          body: "Respondemos el pedido y confirmamos la eliminación por correo dentro de los plazos de la Ley 25.326 de Protección de Datos Personales.",
        },
      ]}
      title="Eliminar mi cuenta"
      updatedAt={updatedAt}
    />
  );
}
