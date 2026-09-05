import { createSupabaseServerClient } from '@/lib/supabase';

// Force dynamic rendering to avoid build-time Supabase calls
export const dynamic = 'force-dynamic';

export default async function Notes() {
  let notes = null;
  let error = null;
  
  try {
    const supabase = createSupabaseServerClient();
    const result = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false });
    notes = result.data;
    error = result.error;
  } catch (e: any) {
    error = e;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Notes</h1>
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
            <p className="text-red-400">Error loading notes: {error.message}</p>
            <p className="text-gray-400 text-sm mt-2">
              Make sure you've run the SQL schema in Supabase and the notes table exists.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Notes</h1>
        
        <div className="space-y-4">
          {notes && notes.length > 0 ? (
            notes.map((note: any) => (
              <div
                key={note.id}
                className="p-6 bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <p className="text-white text-lg mb-2">{note.title}</p>
                {note.created_at && (
                  <p className="text-gray-400 text-sm">
                    {new Date(note.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="p-6 bg-gray-900 rounded-lg border border-gray-800 text-center">
              <p className="text-gray-400">No notes found.</p>
              <p className="text-gray-500 text-sm mt-2">
                Run the SQL schema in Supabase to create the notes table and add sample data.
              </p>
            </div>
          )}
        </div>

        {notes && notes.length > 0 && (
          <div className="mt-8 p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h2 className="text-xl font-semibold mb-4">Raw JSON Data</h2>
            <pre className="text-xs text-gray-400 overflow-auto">
              {JSON.stringify(notes, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

