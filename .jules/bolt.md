## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-16 - Avoid String.prototype.localeCompare inside sort callbacks
**Learning:** In threads-unfollowers.js, using `String.prototype.localeCompare` inside the `.sort()` callback for large lists (like `visibleUsers()`) causes significant synchronous main thread blocking and memory overhead, leading to UI jank.
**Action:** Use a pre-computed `Intl.Collator` instance (e.g., `new Intl.Collator('tr')`) and call its `.compare` method instead when sorting large datasets dynamically during UI rendering.
