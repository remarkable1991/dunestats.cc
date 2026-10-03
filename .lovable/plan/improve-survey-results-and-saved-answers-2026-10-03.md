# Improve survey results and saved answers

## What will change
- Show the custom game setup below the League “one fixed format” result, using the linked saved format answers.
- Restore a signed-in player’s previously submitted answers when they reopen a survey topic, including custom formats.
- Redesign the admin Answers view for faster comparison: clearer topic totals, response counts, percentages, rating summaries, written-answer blocks, and dedicated format rankings.
- Keep anonymous drafts and existing submissions unchanged.

## Technical details
- Pair builder-enabled choice questions with their `${questionId}__format` answer field.
- Merge stored signed-in responses into local drafts after login, without overwriting newer local work.
- Use existing survey format labels and semantic design tokens; no database changes are required.
- Verify the public survey, admin results, type safety, and current build status.
