// Shared shortcut metadata. Runtime registration and native preferences use the same keys.
export const NAVIGATION_SHORTCUTS = Object.freeze([
    {name: 'quran-previous-page', title: 'Previous page', accelerator: '<Control><Alt>Page_Up'},
    {name: 'quran-next-page', title: 'Next page', accelerator: '<Control><Alt>Page_Down'},
    {name: 'quran-first-page', title: 'First page', accelerator: '<Control><Alt>Home'},
    {name: 'quran-last-page', title: 'Last page', accelerator: '<Control><Alt>End'},
    {name: 'quran-go-to-page', title: 'Go to page', accelerator: '<Control><Alt>g'},
    {name: 'quran-search', title: 'Search Quran', accelerator: '<Control><Alt>f'},
]);

export const AUDIO_SHORTCUTS = Object.freeze([
    {name: 'quran-audio-toggle', title: 'Play / pause recitation', accelerator: '<Control><Alt>space'},
    {name: 'quran-audio-stop', title: 'Stop recitation', accelerator: '<Control><Alt>s'},
    {name: 'quran-audio-previous', title: 'Previous verse', accelerator: '<Control><Alt>bracketleft'},
    {name: 'quran-audio-next', title: 'Next verse', accelerator: '<Control><Alt>bracketright'},
    {name: 'quran-audio-volume-up', title: 'Volume up', accelerator: '<Control><Alt>equal'},
    {name: 'quran-audio-volume-down', title: 'Volume down', accelerator: '<Control><Alt>minus'},
]);

export const SHORTCUTS = Object.freeze([...NAVIGATION_SHORTCUTS, ...AUDIO_SHORTCUTS]);
