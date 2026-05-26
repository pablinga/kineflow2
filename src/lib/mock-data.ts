export const appointments: Array<{
  id: string;
  date: string;
  time: string;
  patient: string;
  reason: string;
  status: string;
  modality: string;
  duration: string;
}> = [];

export const evolutions: Array<{
  id: string;
  patient: string;
  date: string;
  diagnosis: string;
  pain: string;
  mobility: string;
  notes: string;
}> = [];
