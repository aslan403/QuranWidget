// Shared shortcut metadata. Runtime registration and native preferences use the same keys.
export const SHORTCUTS = Object.freeze([
    {name: 'quran-previous-page', title: 'Previous page', accelerator: '<Control><Alt>Page_Up'},
    {name: 'quran-next-page', title: 'Next page', accelerator: '<Control><Alt>Page_Down'},
    {name: 'quran-first-page', title: 'First page', accelerator: '<Control><Alt>Home'},
    {name: 'quran-last-page', title: 'Last page', accelerator: '<Control><Alt>End'},
    {name: 'quran-go-to-page', title: 'Go to page', accelerator: '<Control><Alt>g'},
    {name: 'quran-search', title: 'Search Quran', accelerator: '<Control><Alt>f'},
]);
