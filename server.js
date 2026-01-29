const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const axios = require('axios');
const mqtt = require('mqtt');

// ==========================================
// >>> CONFIGURATION GENERALE <<<
// ==========================================

const VIDEO_BASE_URL = 'https://numerilab-cam.duckdns.org'; 

// 1. BAMBU LAB
const BAMBU_CONFIG = {
    ip: '10.0.50.101',
    accessCode: '6f744d5e',
    serial: '0938BC580601730'
};

// 2. ULTIMAKER DIGITAL FACTORY (TEST AVEC NOUVELLES VALEURS)
const UM_AUTH = {
    // Essai avec les valeurs sans le préfixe "um----"
    clientId: 'cesi-dev',
    clientSecret: 'ba054835878643f3-b624e102603d7c4',
    
    tokenUrl: 'https://account.ultimaker.com/sso/oauth2/token',
    scopes: 'connect.cluster.read connect.cluster.write cura.printjob.read cura.printjob.write' 
};

// Stockage Token
let cachedToken = null;
let tokenExpiration = 0;

// 3. LISTE DES IMPRIMANTES
let printers = [
    // LIGNE 1
    { id: 'connect_melibe', name: 'UM 2+ Connect Melibe', type: 'cloud_connect', cloud_name: 'Ultimaker-2C-Melibe', status: 'Idle', progress: 0, pla: 1000, tempNozzle: 0, tempBed: 0 },
    { id: 'connect_dirona', name: 'UM 2+ Connect Dirona', type: 'cloud_connect', cloud_name: 'Ultimaker-2C-Dirona', status: 'Idle', progress: 0, pla: 500, tempNozzle: 0, tempBed: 0 },
    
    // Bambu Lab
    { id: 'bambu1', name: 'Bambu Lab H2S', type: 'bambu', status: 'Offline', progress: 0, pla: 'Détection...', tempNozzle: 0, tempBed: 0 },

    // LIGNE 2
    { id: 'armina', name: 'Armina (UM2+)', type: 'octo', ip: '10.0.50.106', key: 'Lu7pEDHrok0LnsePbwM8NcFUaWP63jsMyh3WI8qsXbc', streamName: 'armina', status: 'Offline', progress: 0, pla: 50 },
    { id: 'glaucus', name: 'Glaucus (UM2+)', type: 'octo', ip: '10.0.50.104', key: '4ZoGSalx3EfKLHk6NqulQPv_TRcfS00xleh2XtJnGmA', streamName: 'glaucus', status: 'Offline', progress: 0, pla: 750 },
    { id: 'berghia', name: 'Berghia (UM2+)', type: 'octo', ip: '10.0.50.105', key: 'VeGNUP3K4mOzDR_kAlf56f-GbgN5J4pPCUTUMGuJ4Zc', streamName: 'berghia', status: 'Offline', progress: 0, pla: 200 }
];

// ==========================================
// >>> AUTH CLOUD <<<
// ==========================================

async function getUltimakerToken() {
    const now = Date.now();
    if (cachedToken && now < tokenExpiration - 60000) return cachedToken;

    console.log(">>> [UM] Tentative connexion (ID: cesi-dev)...");

    try {
        const authHeader = Buffer.from(`${UM_AUTH.clientId}:${UM_AUTH.clientSecret}`).toString('base64');
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('scope', UM_AUTH.scopes);

        const response = await axios.post(UM_AUTH.tokenUrl, params, {
            headers: { 'Authorization': `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        cachedToken = response.data.access_token;
        tokenExpiration = now + (response.data.expires_in * 1000);
        console.log(">>> [UM] SUCCÈS ! Token récupéré.");
        return cachedToken;

    } catch (error) {
        console.error(">>> [UM] ECHEC AUTH:", error.response ? error.response.status : error.message);
        // Affiche le message d'erreur précis renvoyé par Ultimaker pour debug
        if(error.response && error.response.data) console.error(">>> Détails:", JSON.stringify(error.response.data));
        return null;
    }
}

// ==========================================

const upload = multer({ 
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, '/srv/stl-farm'),
        filename: (req, file, cb) => {
            const p = (req.body.firstname||'').trim(), n = (req.body.lastname||'').trim();
            cb(null, `${p}.${n}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
        }
    })
});

app.use(express.static('public')); 
app.use('/aide', express.static('public/aide'));
app.use(express.json());
app.post('/upload', upload.single('file'), (req, res) => res.send({status:'success', filename:req.file.filename}));

// --- MQTT BAMBU ---
let bambuClient = null;
try {
    bambuClient = mqtt.connect(`mqtts://${BAMBU_CONFIG.ip}:8883`, {
        username: 'bblp', password: BAMBU_CONFIG.accessCode, rejectUnauthorized: false
    });
    bambuClient.on('connect', () => {
        console.log(">>> [BAMBU] Connecté");
        bambuClient.subscribe(`device/${BAMBU_CONFIG.serial}/report`);
    });
    bambuClient.on('message', (topic, message) => {
        try {
            const msg = JSON.parse(message.toString());
            const p = printers.find(x => x.type === 'bambu');
            if (!p || !msg.print) return;
            const d = msg.print;
            if (d.gcode_state) p.status = d.gcode_state;
            if (d.mc_percent) p.progress = d.mc_percent;
            if (d.nozzle_temper) p.tempNozzle = Math.round(d.nozzle_temper);
            if (d.bed_temper) p.tempBed = Math.round(d.bed_temper);
            if (d.subtask_name) p.filename = d.subtask_name.replace('.gcode.3mf', '');
            if (d.mc_remaining_time) {
                let now = new Date(); now.setMinutes(now.getMinutes() + d.mc_remaining_time);
                p.endTime = now.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
            }
            if (d.ams && d.ams.ams && d.ams.ams[0] && d.ams.ams[0].tray) {
                let activeTrayId = d.ams.tray_now; 
                if (activeTrayId === undefined || activeTrayId === '255') activeTrayId = 0;
                let tray = d.ams.ams[0].tray[activeTrayId];
                if (tray) {
                    let rawColor = tray.tray_color || "FFFFFF";
                    let colorHex = "#" + rawColor.substring(0, 6);
                    let type = tray.tray_sub_brands || tray.tray_type || 'Filament';
                    let remain = (tray.remain !== undefined && tray.remain >= 0) ? `${tray.remain}%` : '?';
                    p.pla = `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${colorHex}; margin-right:5px; border:1px solid #fff;"></span><span style="color:${colorHex}">${type}</span> <span style="color:#666; font-size:0.8em; margin-left:5px">(${remain})</span>`;
                } else { p.pla = "AMS Ready"; }
            }
            p.camUrl = `${VIDEO_BASE_URL}/stream.html?src=bambu_h2s`; 
            io.emit('printer_update', p);
        } catch(e) {}
    });
} catch (e) { console.error("Err Bambu MQTT", e); }

// --- SOCKET IO & COMMANDES ---
io.on('connection', (socket) => {
    printers.forEach(p => socket.emit('printer_update', p));
    socket.on('set_pla', (d) => { let p=printers.find(x=>x.id===d.id); if(p){p.pla=d.value; io.emit('printer_update', p);} });
    
    socket.on('toggle_pause', async (d) => {
        let p = printers.find(x=>x.id===d.id);
        if(!p) return;

        if (p.type === 'bambu' && bambuClient) {
            const cmd = (p.status === 'RUNNING') ? 'pause' : 'resume';
            bambuClient.publish(`device/${BAMBU_CONFIG.serial}/request`, JSON.stringify({ "print": { "sequence_id": "0", "command": cmd } }));
        }
        else if(p.type === 'octo' && p.ip && p.key) {
             const action = (p.status === 'Paused' || p.status === 'Pausing') ? 'resume' : 'pause';
             try { await axios.post(`http://${p.ip}/api/job`, { command: 'pause', action: action }, { headers: {'X-Api-Key': p.key}}); } catch(e){}
        }
        else if (p.type === 'cloud_connect' && p.cluster_id && p.job_id) {
            const token = await getUltimakerToken();
            if (token) {
                const action = (p.status === 'printing') ? 'pause' : 'resume';
                console.log(`>>> [UM CLOUD] Commande ${action} -> ${p.name}`);
                try {
                    await axios.post(`https://api.ultimaker.com/connect/v1/clusters/${p.cluster_id}/print_jobs/${p.job_id}/action/${action}`, {}, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                } catch(e) { console.error(">>> [UM CLOUD] Erreur Action:", e.response?.data || e.message); }
            }
        }
    });
});

// --- BOUCLE PRINCIPALE ---
setInterval(async () => {
    let cloudClusters = [];
    const token = await getUltimakerToken();

    if (token) {
        try {
            const res = await axios.get('https://api.ultimaker.com/connect/v1/clusters', { headers: { 'Authorization': `Bearer ${token}` } });
            cloudClusters = res.data.data || [];
        } catch (e) { }
    }

    for (let p of printers) {
        if (p.type === 'octo') {
            p.camUrl = `${VIDEO_BASE_URL}/api/stream.mjpeg?src=${p.streamName}`;
            try {
                const [j, s] = await Promise.all([
                    axios.get(`http://${p.ip}/api/job`, {headers:{'X-Api-Key':p.key}, timeout:1500}),
                    axios.get(`http://${p.ip}/api/printer`, {headers:{'X-Api-Key':p.key}, timeout:1500})
                ]);
                p.status = j.data.state; 
                p.filename = j.data.job.file.name;
                p.progress = j.data.progress.completion ? j.data.progress.completion.toFixed(1) : 0;
                p.tempNozzle = s.data.temperature?.tool0?.actual?.toFixed(0) || 0;
                p.tempBed = s.data.temperature?.bed?.actual?.toFixed(0) || 0;
                if(j.data.progress.printTimeLeft) {
                    let now = new Date(); now.setSeconds(now.getSeconds() + j.data.progress.printTimeLeft);
                    p.endTime = now.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
                }
            } catch (e) { } 
        }
        else if (p.type === 'cloud_connect') {
            const data = cloudClusters.find(c => c.friendly_name === p.cloud_name || c.name === p.cloud_name);
            if (data) {
                p.cluster_id = data.id; 
                p.status = data.status; 
                if (data.active_print_job && data.active_print_job.status === 'printing') {
                    p.job_id = data.active_print_job.uuid;
                    p.filename = data.active_print_job.name;
                    if (data.active_print_job.time_total > 0) {
                        p.progress = ((data.active_print_job.time_elapsed / data.active_print_job.time_total) * 100).toFixed(1);
                        let left = data.active_print_job.time_total - data.active_print_job.time_elapsed;
                        let now = new Date(); now.setSeconds(now.getSeconds() + left);
                        p.endTime = now.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
                    }
                } else {
                    p.filename = ""; p.progress = 0; p.endTime = "--:--"; p.job_id = null;
                }
            } else {
                if(token) p.status = "Non trouvée...";
                else p.status = "Erreur Clé API";
            }
        }
        io.emit('printer_update', p);
    }
}, 3000); 

http.listen(3000, '0.0.0.0', () => console.log('>>> FARM CONTROL READY <<<'));