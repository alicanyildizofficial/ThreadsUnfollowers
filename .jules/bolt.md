## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-25 - Avoid String.prototype.localeCompare for Large Dynamic Arrays
**Learning:** `String.prototype.localeCompare` instantiates the collator on every compare call or performs equivalent setup, which is slow for sorting large arrays. In `threads-unfollowers.js`, `visibleUsers` is called frequently during dynamic operations like rendering and filtering, making sorting an expensive, main-thread-blocking operation that can lead to UI jank.
**Action:** Always prefer caching an `Intl.Collator` instance and passing its `.compare` method as the array `.sort` callback instead of using `.localeCompare` within the callback to optimize performance when sorting large collections dynamically.
