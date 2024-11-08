var env = process.env.NODE_ENV ? 'beamup':'local';

let config = {
    BaseURL: "https://einthusan.tv"
}

switch (env) {
    case 'beamup':
		config.port = process.env.PORT
        config.local = "https://2ecbbd610840-einthusantv.baby-beamup.club"
        break;

    case 'local':
		config.port = 3000
        config.local = "http://127.0.0.1:" + config.port;
        break;
}

module.exports = config;