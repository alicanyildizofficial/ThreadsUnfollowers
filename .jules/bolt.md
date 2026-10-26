## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-26 - Cached Intl.Collator vs localeCompare
**Learning:** `String.prototype.localeCompare` creates an implicit `Intl.Collator` instance every time it is called. When sorting large user arrays (e.g., thousands of users in a search filter function that runs on every keystroke), the repeated instantiations cause significant synchronous blocking of the main thread, resulting in UI jank.
**Action:** Always instantiate `Intl.Collator` once and reuse it (e.g., `const collator = new Intl.Collator('tr'); collator.compare(a, b);`) inside sort callbacks for large datasets instead of `localeCompare`.
