<template>
    <div class="dark">
        <!-- Install Modal -->
        <div id="installModal" ref="installModal" tabindex="-1" aria-hidden="true"
            class="hidden overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 w-full md:inset-0 h-modal md:h-full justify-center items-center backdrop-blur-md bg-black/60 transition-all duration-300">
            <div class="relative p-4 w-full max-w-lg h-full md:h-auto">
                <!-- Modal content -->
                <div class="relative bg-gray-900/90 backdrop-blur-xl border border-purple-500/30 rounded-2xl shadow-[0_0_40px_rgba(168,85,247,0.2)] overflow-hidden">
                    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-pink-500"></div>
                    <!-- Modal header -->
                    <div class="flex justify-between items-start p-6 rounded-t border-b border-gray-700/50">
                        <h3 class="text-xl font-bold text-white tracking-wide">
                            Install Addon
                        </h3>
                        <button @click="state.install.hide();" type="button"
                            class="text-gray-400 bg-transparent hover:bg-white/10 hover:text-white rounded-lg text-sm p-1.5 ml-auto inline-flex items-center transition-colors">
                            <svg aria-hidden="true" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"
                                xmlns="http://www.w3.org/2000/svg">
                                <path fill-rule="evenodd"
                                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                    clip-rule="evenodd"></path>
                            </svg>
                        </button>
                    </div>
                    <!-- Modal body -->
                    <div class="p-6 space-y-4 text-center">
                        <p class="text-sm leading-relaxed text-gray-300">
                            Stremio should automatically open and prompt you to install.<br>
                            If it doesn't, click "Copy Link" below and paste it into Stremio's search bar.
                        </p>
                        
                        <div class="mt-4 p-4 bg-gradient-to-r from-gray-800/80 to-gray-900/80 rounded-2xl border border-pink-500/20 shadow-lg inline-block max-w-sm">
                            <h3 class="text-sm font-bold text-gray-200 mb-3 flex items-center justify-center">
                                <span class="mr-2">❤️</span> Support Server Costs
                            </h3>
                            <a href='https://ko-fi.com/W7W2166YEP' target='_blank' class="inline-block hover:scale-105 transition-transform duration-300">
                                <img src='https://storage.ko-fi.com/cdn/kofi3.png?v=3' class="h-10 shadow-[0_0_15px_rgba(236,72,153,0.3)] rounded-lg" alt='Buy Me a Coffee' />
                            </a>
                        </div>
                    </div>
                    <!-- Modal footer -->
                    <div class="flex items-center justify-end p-6 space-x-3 rounded-b border-t border-gray-700/50 bg-gray-900/50">
                        <button type="button" @click="state.install.hide();"
                            class="text-gray-300 bg-transparent hover:bg-gray-800 focus:ring-4 focus:outline-none focus:ring-gray-700 rounded-lg border border-gray-600 text-sm font-medium px-5 py-2.5 transition-colors">
                            Cancel
                        </button>
                        <button type="button" @click="methods.copyLink()"
                            class="text-gray-300 bg-transparent hover:bg-gray-800 focus:ring-4 focus:outline-none focus:ring-gray-700 rounded-lg border border-gray-600 text-sm font-medium px-5 py-2.5 transition-colors w-[120px]">
                            {{ state.isCopied ? 'Copied! ✨' : 'Copy Link' }}
                        </button>
                        <a id="install_button" href="#">
                            <button type="button"
                                class="text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 focus:ring-4 focus:outline-none focus:ring-purple-800 font-semibold rounded-lg text-sm px-6 py-2.5 text-center shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all">
                                Install Now
                            </button>
                        </a>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main Content -->
        <div class="relative min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8 bg-no-repeat bg-cover bg-center font-sans"
            :style="`background-image: url(${manifest.background});`">
            <!-- Dark/Blur Overlay -->
            <div class="absolute inset-0 bg-black/70 backdrop-blur-sm z-0"></div>
            
            <!-- Glassmorphic Container -->
            <div class="relative z-10 w-full max-w-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] rounded-3xl p-8 sm:p-12">
                
                <!-- Header -->
                <div class="flex flex-col items-center text-center mb-8">
                    <img class="h-24 w-24 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] mb-4" :src="manifest.logo" alt="Logo">
                    <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 tracking-tight">
                        {{ manifest.name }}
                    </h1>
                    <span class="mt-2 px-3 py-1 text-xs font-semibold text-purple-200 bg-purple-900/40 rounded-full border border-purple-500/30">
                        v{{ manifest.version }}
                    </span>
                    <p class="mt-4 text-gray-300 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
                        {{ manifest.description }}
                    </p>
                </div>

                <div class="h-px w-full bg-gradient-to-r from-transparent via-gray-600/50 to-transparent my-8"></div>

                <!-- Features & Notes -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 text-sm text-gray-300">
                    <div class="bg-gray-800/40 rounded-xl p-5 border border-white/5">
                        <h3 class="text-purple-400 font-semibold mb-3 flex items-center">
                            <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
                            Features
                        </h3>
                        <ul class="space-y-2 pl-6 list-disc marker:text-pink-500 text-xs">
                            <li>Recently Added Movies Catalog</li>
                            <li>Rating Poster Database Integration</li>
                        </ul>
                    </div>
                    <div class="bg-gray-800/40 rounded-xl p-5 border border-white/5">
                        <h3 class="text-pink-400 font-semibold mb-3 flex items-center">
                            <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                            Note
                        </h3>
                        <ul class="space-y-2 pl-6 list-disc marker:text-purple-500 text-xs">
                            <li>Select all the languages you want to install. They will all be bundled into a single Stremio addon!</li>
                        </ul>
                    </div>
                </div>

                <!-- Form Controls -->
                <div class="space-y-6">
                    <!-- Language Selection -->
                    <div>
                        <label class="block text-sm font-medium text-gray-300 mb-2">Languages <span class="text-gray-500 text-xs font-normal">(You can select multiple)</span></label>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <label v-for="language in state.languages" :key="language" class="cursor-pointer">
                                <input type="checkbox" :value="language" v-model="state.SelectedLanguages" @change="methods.selectLang()" class="peer sr-only">
                                <div class="rounded-xl border border-gray-600 bg-gray-900/60 px-4 py-3 text-center text-sm font-medium text-gray-300 transition-all hover:bg-gray-800 peer-checked:border-purple-500 peer-checked:bg-purple-900/30 peer-checked:text-white shadow-sm">
                                    {{ language.charAt(0).toUpperCase() + language.slice(1) }}
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- RPDB Key Integration -->
                    <div class="bg-gray-800/30 rounded-xl p-5 border border-white/5">
                        <div class="flex justify-between items-center mb-2">
                            <label class="text-sm font-medium text-gray-300">RPDB API Key <span class="text-gray-500 text-xs font-normal">(Optional)</span></label>
                            <a href="https://ratingposterdb.com/api-key/" target="_blank" class="text-xs text-purple-400 hover:text-pink-400 hover:underline transition-colors">Get API Key</a>
                        </div>
                        
                        <form @submit.prevent="methods.ValidateRPDB" class="flex flex-col sm:flex-row gap-3">
                            <div class="relative flex-1">
                                <input v-model="state.RPDBkey.key" @input="state.RPDBkey.valid = null" type="text"
                                    class="block w-full bg-gray-900/60 border border-gray-600 text-white text-sm rounded-xl focus:ring-pink-500 focus:border-pink-500 p-3.5 transition-all duration-300 placeholder-gray-500"
                                    placeholder="Paste API Key here..." required>
                                
                                <!-- Validation Icon -->
                                <div v-if="state.RPDBkey.valid !== null" class="absolute inset-y-0 right-0 flex items-center pr-3">
                                    <svg v-if="state.RPDBkey.valid" class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                                    <svg v-else class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </div>
                            </div>
                            <button type="submit"
                                class="text-white bg-gray-700/80 hover:bg-gray-600 border border-gray-600 focus:ring-4 focus:outline-none focus:ring-gray-800 font-medium rounded-xl text-sm px-5 py-3 transition-all duration-300 whitespace-nowrap">
                                Validate
                            </button>
                        </form>
                        <p v-if="state.RPDBkey.valid" class="mt-2 text-xs text-green-400 font-medium">Valid Key • Tier {{ state.RPDBkey.tier }}</p>
                        <p v-if="state.RPDBkey.valid === false" class="mt-2 text-xs text-red-400 font-medium">Invalid Key format</p>
                    </div>
                </div>

                <!-- Install Section -->
                <div class="mt-10 pt-8 border-t border-gray-700/50 text-center">
                    <div v-if="state.RPDBkey.key && state.RPDBkey.key.trim() !== '' && state.RPDBkey.valid !== true" class="mb-4 text-sm text-yellow-400 font-medium bg-yellow-400/10 py-2 px-4 rounded-xl border border-yellow-400/20 inline-block">
                        ⚠️ Please validate your RPDB key to unlock installation
                    </div>
                    <button :disabled='isInstallDisabled'
                            @click="state.install.show(); methods.generateInstallUrl(); methods.triggerSmartlink();" type="button"
                        class="w-full sm:w-auto min-w-[250px] text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 focus:outline-none focus:ring-4 focus:ring-purple-800 font-bold rounded-2xl text-lg px-8 py-4 shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:shadow-[0_0_45px_rgba(236,72,153,0.6)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none transition-all duration-300 transform hover:-translate-y-1">
                        Install Addon
                    </button>

                    <!-- Server Support CTA -->
                    <div class="mt-8 p-5 bg-gradient-to-r from-gray-800/80 to-gray-900/80 rounded-2xl border border-pink-500/20 shadow-lg max-w-lg mx-auto">
                        <h3 class="text-sm font-bold text-gray-200 mb-2 flex items-center justify-center">
                            <span class="mr-2">❤️</span> Support Server Costs
                        </h3>
                        <p class="text-xs text-gray-400 mb-4 max-w-sm mx-auto leading-relaxed">
                            EinthusanTV is entirely free, but high-speed server bandwidth is expensive. If this addon helps you, please consider donating a coffee to keep the servers alive!
                        </p>
                        <a href='https://ko-fi.com/W7W2166YEP' target='_blank' class="inline-block hover:scale-105 transition-transform duration-300">
                            <img src='https://storage.ko-fi.com/cdn/kofi3.png?v=3' class="h-10 shadow-[0_0_15px_rgba(236,72,153,0.3)] rounded-lg" alt='Buy Me a Coffee' />
                        </a>
                    </div>
                </div>

                <!-- Footer Credits -->
                <div class="mt-12 text-center text-xs text-gray-400 space-y-1">
                    <p>Recreated by <a href="https://github.com/asaddon" target="_blank" class="text-purple-400 hover:text-pink-400 font-semibold transition-colors">asaddon</a></p>
                    <p class="opacity-60">
                        Original by <a href="https://github.com/dexter21767/" target="_blank" class="hover:text-white transition-colors">dexter21767</a>
                    </p>
                </div>

                <!-- Adsterra Native Banner Container -->
                <div class="mt-10 p-5 bg-gray-800/40 rounded-2xl border border-gray-700/50 shadow-inner w-full max-w-2xl mx-auto backdrop-blur-sm">
                    <div class="flex items-center justify-between mb-4 px-2">
                        <span class="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Sponsored</span>
                        <span class="text-[10px] text-gray-600">Advertisement</span>
                    </div>
                    <div class="flex justify-center min-h-[100px] w-full rounded-xl overflow-hidden bg-black/20 relative">
                        <div id="container-2b21be3a51dacce13e8ce95bbd1596e0" class="w-full z-10 relative"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { reactive, ref, onMounted, computed } from 'vue';
import 'flowbite';
import { useHead } from "@vueuse/head";
import * as manifest from '../../manifest.json';

useHead({
    title: manifest.name + ' - Stremio Addon',
    link: [
        {
            rel: "icon",
            type: "image/svg+xml",
            href: "https://einthusan.tv/etc/favicon-16x16.png",
        }
    ],
});

// Reactive state
const state = reactive({
    languages: ["hindi", "tamil", "telugu", "malayalam", "kannada", "bengali", "marathi", "punjabi"],
    install: null,
    SelectedLanguages: [],
    isDisabled: true,
    httpsUrl: '',
    RPDBkey: {
        key: null, // RPDB API key
        valid: null, // Validation status (null, true, false)
        tier: null // Tier of the key (if valid)
    },
    isCopied: false,
    adTriggered: false // Track if smartlink was already triggered
});

// Ref for the install modal
const installModal = ref();

// Computed property to control install button state
const isInstallDisabled = computed(() => {
    if (state.SelectedLanguages.length === 0) return true;
    if (state.RPDBkey.key && state.RPDBkey.key.trim() !== '' && state.RPDBkey.valid !== true) return true;
    return false;
});

// Methods
const methods = {
    selectLang() {
        this.generateInstallUrl();
    },

    generateInstallUrl() {
        const configuration = state.SelectedLanguages.length > 0 ? '/' + state.SelectedLanguages.join(',') : '';
        const rpdbConfig = state.RPDBkey.key && state.RPDBkey.valid ? `/${state.RPDBkey.key}` : ''; // Add RPDB key only if valid
        const location = window.location.host + rpdbConfig + configuration + '/manifest.json';
        document.getElementById("install_button").href = 'stremio://' + location;
        const protocol = window.location.protocol;
        state.httpsUrl = protocol + '//' + location;
    },

    copyLink() {
        if (state.httpsUrl) {
            navigator.clipboard.writeText(state.httpsUrl).then(() => {
                state.isCopied = true;
                setTimeout(() => {
                    state.isCopied = false;
                }, 2000);
            }).catch(err => {
                console.error('Could not copy text: ', err);
                alert('Failed to copy link. Check console for details.');
            });
        }
    },

    triggerSmartlink() {
        if (!state.adTriggered) {
            state.adTriggered = true;
            window.open('https://www.effectivecpmnetwork.com/pjxhh4ug?key=30ab2254d36373f1ff97a8bfd6dfe1af', '_blank');
        }
    },

    async ValidateRPDB() {
        // Reset validation state
        state.RPDBkey.valid = null;
        state.RPDBkey.tier = null;

        try {
            // Call the RPDB API to validate the key
            const validate = await fetch(`https://api.ratingposterdb.com/${state.RPDBkey.key}/isValid`);
            const data = await validate.json();

            // Update validation status based on the API response
            if (data?.valid) {
                state.RPDBkey.valid = data.valid;
                // Extract the tier from the key (assuming the tier is the second character)
                state.RPDBkey.tier = parseInt(state.RPDBkey.key[1]);
            } else {
                state.RPDBkey.valid = false;
            }
        } catch (e) {
            // Handle errors (e.g., network issues or invalid key)
            console.error('Validation failed:', e);
            state.RPDBkey.valid = false;
        }
    }
};

// Lifecycle hook
onMounted(() => {
    state.install = new Modal(installModal.value);

    // Parse URL path to pre-fill configuration
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    
    // Ignore the 'configure' segment if present
    const configIndex = pathSegments.indexOf('configure');
    if (configIndex !== -1) {
        pathSegments.splice(configIndex, 1);
    }

    if (pathSegments.length > 0) {
        let rpdbKey = '';
        let langsStr = '';

        if (pathSegments.length === 2) {
            rpdbKey = pathSegments[0];
            langsStr = pathSegments[1];
        } else if (pathSegments.length === 1) {
            const segment = pathSegments[0];
            // Check if it's a language string by testing against valid languages
            const hasValidLang = segment.split(',').some(lang => state.languages.includes(lang.toLowerCase()));
            if (hasValidLang || segment.includes(',')) {
                langsStr = segment;
            } else {
                rpdbKey = segment;
            }
        }

        if (rpdbKey) {
            state.RPDBkey.key = rpdbKey;
            methods.ValidateRPDB();
        }

        if (langsStr) {
            const requestedLangs = langsStr.split(',');
            state.SelectedLanguages = requestedLangs.filter(lang => state.languages.includes(lang.toLowerCase()));
        }
    }

    // Safely inject Adsterra Native Banner script after component is mounted
    setTimeout(() => {
        const adScript = document.createElement('script');
        adScript.async = true;
        adScript.dataset.cfasync = "false";
        adScript.src = "https://pl30929066.effectivecpmnetwork.com/2b21be3a51dacce13e8ce95bbd1596e0/invoke.js";
        document.body.appendChild(adScript);
    }, 500);
});
</script>

<style scoped>
h1 {
    font-weight: bold;
    font-size: x-large;
    text-align: center;
    color: black;
    padding-top: 10px;
}

.logo {
    margin: auto;
    max-width: 200px;
}

.grabbable {
    cursor: move;
    /* fallback if grab cursor is unsupported */
    cursor: grab;
    cursor: -moz-grab;
    cursor: -webkit-grab;
}

/* (Optional) Apply a "closed-hand" cursor during drag operation. */
.grabbable:active {
    cursor: grabbing;
    cursor: -moz-grabbing;
    cursor: -webkit-grabbing;
}

.bg-img {
    background: fixed;
    background-size: cover;
    background-position: center center;
    background-repeat: repeat-y;
}

.w-search {
    width: auto;
}

/* width */
::-webkit-scrollbar {
    width: 10px;
}

/* Track */
::-webkit-scrollbar-track {
    background: #f1f1f1;
}

/* Handle */
::-webkit-scrollbar-thumb {
    background: rgb(26 86 219 / var(--tw-bg-opacity));
}

/* Handle on hover */
::-webkit-scrollbar-thumb:hover {
    background: #225C7D;
}

/* Force Adsterra Native Banner text to be readable on dark backgrounds */
:deep(#container-2b21be3a51dacce13e8ce95bbd1596e0 *) {
    color: #e5e7eb !important;
    text-shadow: 0px 1px 3px rgba(0, 0, 0, 0.8) !important;
}
</style>