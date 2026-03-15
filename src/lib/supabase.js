import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://baqshrpqoofqaecciidg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcXNocnBxb29mcWFlY2NpaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDg4NDEsImV4cCI6MjA4OTEyNDg0MX0.3CXBnr14AOTq9X60y-DUlAF3o23smb1ZgklZriFi11Q';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
