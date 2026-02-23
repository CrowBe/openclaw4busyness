export type JobNote = {
  id: string;
  job_id: string | null;
  worker_name: string | null;
  transcript: string;
  scrubbed: boolean;
  pii_found: boolean;
  created_at: string;
};
