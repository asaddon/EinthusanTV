<template>
    <div>
        <!-- Install Modal -->
        <div id="installModal" ref="installModal" tabindex="-1" aria-hidden="true"
            class="hidden overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 w-full md:inset-0 h-modal md:h-full justify-center items-center">
            <div class="relative p-4 w-full max-w-2xl h-full md:h-auto">
                <!-- Modal content -->
                <div class="relative bg-white rounded-lg shadow dark:bg-gray-700">
                    <!-- Modal header -->
                    <div class="modal-header">
                        <div class="flex justify-between items-start p-4 rounded-t border-b dark:border-gray-600">
                            <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
                                Install the addon
                            </h3>
                            <button @click="state.install.hide();" type="button"
                                class="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center dark:hover:bg-gray-600 dark:hover:text-white"
                                data-modal-toggle="defaultModal">
                                <svg aria-hidden="true" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"
                                    xmlns="http://www.w3.org/2000/svg" data-darkreader-inline-fill=""
                                    style="--darkreader-inline-fill:currentColor;">
                                    <path fill-rule="evenodd"
                                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                        clip-rule="evenodd"></path>
                                </svg>
                                <span class="sr-only">Close modal</span>
                            </button>
                        </div>
                    </div>
                    <!-- Modal body -->
                    <div class="p-6 space-y-6">
                        <p class="text-base leading-relaxed text-gray-500 dark:text-gray-400">
                            Hello guys, if you enjoy this addon and want it to keep working, and want new features to be
                            added <br>Then please consider donating.</p>
                        <div style="align-items: center; display: flex; justify-content: center;">
                            <div style="margin: auto">
                                <p>Buymeacoffee.com</p>
                                <a href='https://www.buymeacoffee.com/asaddon' target='_blank'><img
                                        src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=asaddon&button_colour=FF5F5F&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00" /></a>
                            </div>
                            <div style="margin: auto">
                                <p>Ko-fi.com</p>
                                <a href='https://ko-fi.com/W7W2166YEP' target='_blank'><img height='36'
                                        style='border:0px;height:36px;'
                                        src='https://storage.ko-fi.com/cdn/kofi3.png?v=3' border='0'
                                        alt='Buy Me a Coffee at ko-fi.com' />
                                </a>
                            </div>
                        </div>
                    </div>
                    <!-- Modal footer -->
                    <div
                        class="flex items-center p-6 space-x-2 rounded-b border-t border-gray-200 dark:border-gray-600">
                        <a id="install_button" href="#"><button type="button"
                                class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">Install
                                Addon</button></a>
                        <button type="button" @click="state.install.hide();"
                            class="text-gray-500 bg-white hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-gray-200 text-sm font-medium px-5 py-2.5 hover:text-gray-900 focus:z-10 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-500 dark:hover:text-white dark:hover:bg-gray-600 dark:focus:ring-gray-600">Cancel</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main Content -->
        <div class="bg-img relative min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 bg-gray-500 bg-no-repeat bg-cover bg-center relative items-center"
            :style="`background-image: url(${manifest.background});`">
            <div class="absolute bg-black opacity-60 inset-0 z-0"></div>
            <div class="max-w-md w-full space-y-8 p-10 bg-white shadow-lg rounded-xl z-10">
                <div class="grid gap-8 grid-cols-1">
                    <div class="flex flex-col ">
                        <div class="items-center header">
                            <img class="logo" :src="manifest.logo">
                            <h1 class="font-semibold text-lg mr-auto">{{ manifest.name }}</h1>
                            <h2 class="font-semibold text-lg mr-auto" style="text-align: right;">Version: {{ manifest.version }}</h2>
                            <p class="mt-5">{{ manifest.description }}</p>
                        </div>

                        <div class="flex items-center justify-center space-x-2 mt-5">
                            <span class="h-px w-full bg-gray-200"></span>
                        </div>

                        <div class="items-center mt-5 description">
                            <h2 class="font-semibold text-lg mr-auto">Extra Features:</h2>
                            <ul>
                                <li>Show Recently Added Movies Catalog</li>
                                <li>Rating Poster Database Integration</li>
                            </ul>
                        </div>

                        <div class="items-center mt-5 description">
                            <h2 class="font-semibold text-lg mr-auto">Note:</h2>
                            <ul>
                                <li>To use multiple languages, simply re-add the addon with each desired language.</li>
                            </ul>
                        </div>

                        <!-- Language Selection -->
                        <div class="mt-5">
                            <label for="Input"
                                class="mb-2 text-sm font-medium text-gray-900 sr-only dark:text-gray-300">Search
                                Language</label>
                            <div class="relative">
                                <select v-model="state.Language" @change="methods.selectLang()" id="Input"
                                    class="block p-4 pl-10 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                                    <option disabled value="">Select Languages</option>
                                    <option v-for="language in state.languages" :value="language">{{ language.charAt(0).toUpperCase() + language.slice(1) }}
                                    </option>
                                </select>
                            </div>
                        </div>

                        <div class="mt-5">
                        <small><b>RPDB key:</b> <a href="https://ratingposterdb.com/api-key/" target="_blank"
                        class="text-xs font-semibold text-gray-600 py-2">RPDB API (?)</a></small>

                        <form @submit.prevent="methods.ValidateRPDB">
                        <div class="relative">
                        <input v-model="state.RPDBkey.key" id="RPDB"
                        class="block p-4 pl-10 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                        placeholder="Paste RPDB API Key (optional)" required>
                        </div>

                        <div class="mt-3">
                        <button type="submit"
                        class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-4 py-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">
                        Validate Key
                        </button>
                        </div>

                    <small v-if="state.RPDBkey.valid !== null" class="block mt-2">
                    Key is: 
                    <b v-if="state.RPDBkey.valid" style="color: green;">Valid</b>
                    <b v-if="!state.RPDBkey.valid" style="color: red;">Invalid</b>
                    <span v-if="state.RPDBkey.valid">(Tier: {{ state.RPDBkey.tier }})</span>
                    </small>
                    </form>
                    </div>

                        <div class="flex items-center justify-center space-x-2 mt-10">
                            <span class="h-px w-full bg-gray-200"></span>
                        </div>

                        <div class="items-center mt-5 description">
                            <h2 class="font-semibold text-lg mr-auto">Selected Language:</h2>
                            <br>
                            <h3>{{ state.Language ? state.Language.charAt(0).toUpperCase() + state.Language.slice(1) : 'None' }}</h3>
                        </div>

                        <div class="flex items-center justify-center space-x-2 mt-10">
                            <span class="h-px w-full bg-gray-200"></span>
                        </div>

                        <div class="mt-10 flex flex-col">
                            <button :disabled='state.isDisabled'
                                @click="state.install.show(); methods.generateInstallUrl();" type="button"
                                class="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">Install
                                Addon</button>
                        </div>

                        <div class="flex items-center justify-center space-x-2 mt-5">
                            <span class="h-px w-full bg-gray-200"></span>
                        </div>

                        <div class="flex flex-col mt-5" style="align-items: center;">
                            <p class="text-center">This addon was recreated by:
                                <a href="https://github.com/asaddon" target="_blank" class="text-purple-700"><b style="font-weight: 600;">asaddon</b></a><br /></p>
                            <p class="text-center">Orignally By:
                                <a href="https://github.com/dexter21767/" target="_blank" class="text-purple-700"><b style="font-weight: 600;">dexter21767</b></a><br />
                                UI by:
                                <a href="https://github.com/rleroi" target="_blank" class="text-purple-700"><b style="font-weight: 600;">rab1t</b></a><br />
                                Background by:
                                <b class="text-purple-700" style="font-weight: 600;">Ahlen Ken A. Batalon</b>.
                            </p>
                        </div>
                    </div>
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