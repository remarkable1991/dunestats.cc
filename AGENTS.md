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

- Lobby League Elo reads are batched by seated player keys and lobby season under pilot RLS; this keeps seasonal ratings separate and inaccessible to non-pilot users.
- Semi-finals scheduling stays isolated from qualifier methods; registration overrides are trial-only and candidate ranking uses shared player-block coverage with nonzero per-player availability to avoid impossible timezone fallbacks.
- LFG roster merging and lobby membership/host checks live in `src/lib/lfg-seats.ts`, shared by `/lfg` and `/lfg/$id`; one source of truth avoids the list and detail pages disagreeing on who is seated.
- Lobby format artwork and cancellation controls are shared between list and detail pages; cancellation verifies authenticated host ownership or LFG/admin roles server-side before changing the existing status, preserving roster and history without schema changes.
- Lobby identity display uses a shared verified-map-first guild-directory resolver; directory suggestions may label/link players but must never grant host/member access or silently write authoritative mappings.
- Main-admin player-record consolidation runs atomically through a service-only RPC after server-side role verification; it never moves Auth identities or grants permissions, and conflicting tournament registrations require separate review.
- League settings writes preserve format fields in the database RPC; unedited guest lists use NULL to preserve the latest roster rather than replacing it from stale forms.
- LFG history queries filter and paginate before display; successful public history excludes private League rows, and privileged history reads verify roles server-side before service access.
- Match/lobby corrections run service-only atomic RPCs with an authenticated administrator actor; missing per-match League deltas block rollback instead of guessing rating contributions.
