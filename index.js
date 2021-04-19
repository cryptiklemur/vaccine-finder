require('dotenv').config();
const zipcodes = require('zipcodes');
const fetch = require('node-fetch');
const {Webhook, MessageBuilder} = require('webhook-discord');

const zipCode = parseInt(process.env.ZIP_CODE, 10);
const distance = parseInt(process.env.DISTANCE, 10);

const urls = process.env.WEBHOOK_URLS.split(',');

const hooks = urls.map((x) => new Webhook(x));

function fetchJSON(url) {
    return fetch(url).then((x) => x.json()).then((x) => x.features.map((y) => y.properties));
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop() {
    const url = `https://vaccinespotter.org/api/v0/states/${process.env.STATE}.json`;
    const json = await fetchJSON(url);

    const inRangeWithAppointments = [];
    for (const prop of json) {
        const calcDistance = zipcodes.distance(zipCode, prop.postal_code);
        if (calcDistance > distance) {
            continue;
        }

        if (!prop.appointments_available) {
            continue;
        }

        if (prop.provider.toLowerCase().indexOf('walmart') >= 0) {
            continue;
        }

        const apts = prop.appointments?.length ?? 0;
        if (!apts || !calcDistance || !prop.postal_code) {
            continue;
        }

        if (apts <= 1) {
            continue;
        }

        inRangeWithAppointments.push({
            url: prop.url,
            city: prop.city,
            address: prop.address,
            provider: prop.provider.replace('_', ' '),
            zipCode: prop.postal_code,
            distance: calcDistance,
            available: prop.appointments?.length ?? 0,
        });
    }

    if (inRangeWithAppointments.length === 0) {
        return;
    }

    const map = `https://www.vaccinespotter.org/${process.env.STATE}/?zip=${zipCode}&radius=${distance}`
    let length = 0;
    const msg = new MessageBuilder()
        .setTitle('Vaccine\'s Spotted!')
        .setName('Vaccine Spotter')
        .setDescription(`We have spotted some open appointment locations for the vaccine\n[Click here for a map](${map})`)
        .setColor('#00fffa')
        .setFooter('Distances are from: ' + zipCode)
        .setTime(new Date() / 1000);
        
    if (process.env.MENTION) {
        msg.setText(process.env.MENTION);
    }

    for (const location of inRangeWithAppointments) {
        if (length >= 12) {
            break;
        }

        msg.addField(location.provider + ' - ' + location.available, `${location.zipCode} - ${location.distance}mi\n[Create Appt](${location.url})`, true)
        length++;
    }

    hooks.forEach((x) => x.send(msg));
}

async function main() {
    do {
        await loop().catch(console.error);
        process.stdout.write('\rLast Check: ' + (new Date().toLocaleTimeString()))
        await sleep(60 * 1000);
    } while(true);
}

main().then(() => console.log('Closed'), console.error.bind(console, 'Errored: '));