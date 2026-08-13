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
                    <div class="p-6 space-y-6 text-center">
                        <p class="text-sm leading-relaxed text-gray-300">
                            If you enjoy this addon and want to support future updates,<br>please consider donating!
                        </p>
                        <div class="flex flex-col sm:flex-row items-center justify-center gap-6 mt-4">
                            <a href='https://ko-fi.com/W7W2166YEP' target='_blank' class="hover:scale-105 transition-transform">
                                <img src='https://storage.ko-fi.com/cdn/kofi3.png?v=3' class="h-10 shadow-lg rounded-lg" alt='Buy Me a Coffee' />
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
                            class="text-gray-300 bg-transparent hover:bg-gray-800 focus:ring-4 focus:outline-none focus:ring-gray-700 rounded-lg border border-gray-600 text-sm font-medium px-5 py-2.5 transition-colors">
                            Copy Link
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
                            <li>To use multiple languages, simply re-add the addon with each desired language.</li>
                        </ul>
                    </div>
                </div>

                <!-- Form Controls -->
                <div class="space-y-6">
                    <!-- Language Selection -->
                    <div>
                        <label class="block text-sm font-medium text-gray-300 mb-2">Language</label>
                        <div class="relative group">
                            <select v-model="state.Language" @change="methods.selectLang()" 
                                class="block w-full appearance-none bg-gray-900/60 border border-gray-600 text-white text-sm rounded-xl focus:ring-purple-500 focus:border-purple-500 p-4 transition-all duration-300 group-hover:border-purple-400/50">
                                <option disabled value="">Select Language</option>
                                <option v-for="language in state.languages" :value="language" class="bg-gray-900 text-white">
                                    {{ language.charAt(0).toUpperCase() + language.slice(1) }}
                                </option>
                            </select>
                            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
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
                                <input v-model="state.RPDBkey.key" type="text"
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
                    <button :disabled='state.isDisabled'
                        @click="state.install.show(); methods.generateInstallUrl();" type="button"
                        class="w-full sm:w-auto min-w-[250px] text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 focus:outline-none focus:ring-4 focus:ring-purple-800 font-bold rounded-2xl text-lg px-8 py-4 shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:shadow-[0_0_45px_rgba(236,72,153,0.6)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none transition-all duration-300 transform hover:-translate-y-1">
                        Install Addon
                    </button>
                    <p class="mt-4 text-xs text-gray-500 font-medium tracking-wide uppercase">Requires Stremio App</p>
                </div>

                <!-- Footer Credits -->
                <div class="mt-12 text-center text-xs text-gray-400 space-y-1">
                    <p>Recreated by <a href="https://github.com/asaddon" target="_blank" class="text-purple-400 hover:text-pink-400 font-semibold transition-colors">asaddon</a></p>
                    <p class="opacity-60">
                        Original by <a href="https://github.com/dexter21767/" target="_blank" class="hover:text-white transition-colors">dexter21767</a>
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
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
    Language: '',
    isDisabled: true,
    httpsUrl: '',
    RPDBkey: {
        key: null, // RPDB API key
        valid: null, // Validation status (null, true, false)
        tier: null // Tier of the key (if valid)
    }
});

// Ref for the install modal
const installModal = ref();

// Methods
const methods = {
    selectLang() {
        state.isDisabled = false;
        this.generateInstallUrl();
    },

    generateInstallUrl() {
        const configuration = state.Language ? '/' + state.Language : '';
        const rpdbConfig = state.RPDBkey.key && state.RPDBkey.valid ? `/${state.RPDBkey.key}` : ''; // Add RPDB key only if valid
        const location = window.location.host + rpdbConfig + configuration + '/manifest.json';
        document.getElementById("install_button").href = 'stremio://' + location;
        const protocol = window.location.protocol;
        state.httpsUrl = protocol + '//' + location;
    },

    copyLink() {
        if (state.httpsUrl) {
            navigator.clipboard.writeText(state.httpsUrl).then(() => {
                alert('Addon HTTPS link copied to clipboard!');
            }).catch(err => {
                console.error('Could not copy text: ', err);
                alert('Failed to copy link. Check console for details.');
            });
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
</style>