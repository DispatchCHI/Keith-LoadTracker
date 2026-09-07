import { loadEnv } from 'vite';
const e = loadEnv('development', process.cwd(), '');
const keys = Object.keys(e).filter((k) => k.includes('SUPABASE') || k.startsWith('VITE_'));
console.log('keys', keys.join(','));
for (const k of keys) console.log(k, 'len', String(e[k]).length);
