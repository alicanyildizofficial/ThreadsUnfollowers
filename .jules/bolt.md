## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2024-11-03 - Cache Intl.Collator for Sorting Performance
**Learning:** In `threads-unfollowers.js`, sorting large lists using `String.prototype.localeCompare` within a `.sort()` callback on every keystroke causes significant synchronous main thread blocking and performance overhead due to repeated initialization of the comparison mechanism.
**Action:** Always instantiate and cache an `Intl.Collator` object globally, then use its `.compare()` method in the sort callback when sorting datasets in render functions.
