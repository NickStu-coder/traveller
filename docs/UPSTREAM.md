# Upstream maintenance

Foundation: https://github.com/affromero/flight-finder.
Fork: https://github.com/NickStu-coder/traveller.
Base commit: `608eb42d7775f238ae1a7cf0b437a814091460c3`, committed 2026-10-04.
Package version: 0.15.0. The main branch contains changes after the v0.15.0 release; it is not the release tag.
License: MIT, copyright Andres Romero. Keep `LICENSE` and dependency notices intact.

## Remotes and branches

`upstream` points to the foundation; `origin` points to the Traveller fork. Development starts on `traveller`. Merge an explicitly reviewed upstream SHA on a separate integration branch. Run the full web/CLI gate and migration checks before updating production.

## Divergences

Traveller modules live under `apps/web/src/lib/traveller`; UI/API routes have their own namespaces. Internal `@flight-finder/*` workspace names remain for compatibility. Product branding is Traveller. Deployment is specific to Synology/Portainer, with no author-specific host mounts.

Unavoidable core changes: safe migration startup, authentication mode enforcement and entry screens, branding, additional Prisma relations, notification/worker startup integration and history retention. Review these explicitly during every upstream merge. New upstream schema changes require an additive reviewed migration; never reinstate automatic data-loss acceptance.

## Merge procedure

Fetch upstream, review commits and license/dependency changes, merge locally, inspect schema diff, generate a migration against the previous schema, review SQL, run unit/integration/browser/build checks, back up staging, test the exact image by digest, then deploy. Keep the prior digest for rollback. Do not rebase published production history or overwrite Traveller secrets/configuration.

## Known conflict areas

`docker-entrypoint.sh`, `Dockerfile`, production workflow, Prisma schema, access pages/middleware, shared user authorization and locale dictionaries. Existing upstream tests remain useful; add Traveller-specific regression cases instead of removing failures.
