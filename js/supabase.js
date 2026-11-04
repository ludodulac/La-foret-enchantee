const SUPABASE_URL = 'https://jwyayfkssyagvnablttg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3eWF5Zmtzc3lhZ3ZuYWJsdHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MjI2ODAsImV4cCI6MjA5NzQ5ODY4MH0.Agcv5wdm2WWZXDlnOpB7nH1_pjmn-MTzp_35InEjuOw';

// On utilise un nom différent pour éviter le conflit avec window.supabase
const dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public`;

function getPublicUrl(bucket, path) {
  // R2 references coexist with all legacy Supabase paths. No data migration.
  if (typeof path === 'string' && path.startsWith('r2:')) {
    const key = path.slice(3);
    const valid = /^(?:contes\/[a-z0-9_-]+\.mp3|couvertures\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp))$/i.test(key);
    return valid ? 'https://foret-enchantee-stockage.rondes.workers.dev/media/' + key : '';
  }
  return `${STORAGE_URL}/${bucket}/${path}`;
}
