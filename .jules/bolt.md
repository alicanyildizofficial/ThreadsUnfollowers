## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-20 - Expensive string sort in render loop
**Learning:** In threads-unfollowers.js, using `localeCompare` string sorting inside `visibleUsers()` causes an expensive O(N log N) operation during every synchronous UI keystroke event, leading to UI jank.
**Action:** Pre-sort large arrays (`state.following`, `state.followers`) once after fetching instead of on every render, as `.filter()` preserves array order.
