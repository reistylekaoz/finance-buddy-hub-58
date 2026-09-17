<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Database migrations (Supabase / Lovable Cloud)

This project's database is managed by Lovable Cloud. Neither the user nor an
external collaborator (e.g. Claude Code via GitHub) has direct access to the
Supabase dashboard or SQL editor — the only way to change schema or RLS
policies is to commit a `.sql` file under `supabase/migrations/` and push it.

Lovable does **not** apply new migration files automatically on push — there
is no trigger for that. After pushing a migration, the user must open the
Lovable chat and send a short message (e.g. "aplicar migrações") so Lovable
checks for pending migration files and applies them to the connected
database. An external collaborator finishing a task that adds a migration
file should tell the user to do this.
