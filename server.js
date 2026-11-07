const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const axios = require('axios');
const mqtt = require('mqtt');
const ftp = require('basic-ftp');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/srv/stl-farm';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const getEnv = (key, fallback = '') => {
  const value = process.env[key];
  return value !== undefined ? value : fallback;
};

const VIDEO_BASE_URL = getEnv('VIDEO_BASE_URL', 'https://numerilab-cam.cesilarochelle.fr');

const FTP_CONFIG = {
  host: getEnv('FTP_HOST', '10.0.50.55'),
  user: getEnv('FTP_USER', 'gestion-impression'),
  password: getEnv('FTP_PASSWORD', ''),
  remotePath: getEnv('FTP_REMOTE_PATH', '')
};

const BAMBU_CONFIG = {
  ip: getEnv('BAMBU_IP', '10.0.0.1'),
  accessCode: getEnv('BAMBU_ACCESS_CODE', ''),
  serial: getEnv('BAMBU_SERIAL', '')
};

const UM_AUTH = {
  clientId: getEnv('ULTIMAKER_CLIENT_ID', ''),
  clientSecret: getEnv('ULTIMAKER_CLIENT_SECRET', ''),
  tokenUrl: getEnv('ULTIMAKER_TOKEN_URL', 'https://account.ultimaker.com/sso/oauth2/token'),
  scopes: getEnv('ULTIMAKER_SCOPES', 'connect.cluster.read connect.cluster.write cura.printjob.read cura.printjob.write')
};

let cachedToken = null;
let tokenExpiration = 0;

const printers = [
  { id: 'connect_melibe', name: 'UM 2+ Connect Melibe', type: 'cloud_connect', cloud_name: getEnv('PRINTER_MELIBE_NAME', 'Ultimaker-2C-Melibe'), status: 'Idle', progress: 0, pla: 1000, tempNozzle: 0, tempBed: 0 },
  { id: 'connect_dirona', name: 'UM 2+ Connect Dirona', type: 'cloud_connect', cloud_name: getEnv('PRINTER_DIRONA_NAME', 'Ultimaker-2C-Dirona'), status: 'Idle', progress: 0, pla: 500, tempNozzle: 0, tempBed: 0 },
  { id: 'bambu1', name: 'Bambu Lab H2S', type: 'bambu', status: 'Offline', progress: 0, pla: 'Détection...', tempNozzle: 0, tempBed: 0 },
  { id: 'armina', name: 'Armina (UM2+)', type: 'octo', ip: getEnv('ARMINA_IP', '10.0.50.106'), key: getEnv('ARMINA_KEY', ''), streamName: 'armina', status: 'Offline', progress: 0, pla: 50 },
  { id: 'glaucus', name: 'Glaucus (UM2+)', type: 'octo', ip: getEnv('GLAUCUS_IP', '10.0.50.104'), key: getEnv('GLAUCUS_KEY', ''), streamName: 'glaucus', status: 'Offline', progress: 0, pla: 750 },
  { id: 'berghia', name: 'Berghia (UM2+)', type: 'octo', ip: getEnv('BERGHIA_IP', '10.0.50.105'), key: getEnv('BERGHIA_KEY', ''), streamName: 'berghia', status: 'Offline', progress: 0, pla: 200 }
];

async function uploadToFTP(localPath, filename) {
  if (!FTP_CONFIG.password) {
    console.warn('>>> [FTP] Aucun mot de passe configuré, upload local seulement.');
    return;
  }

  const client = new ftp.Client();
  try {
    await client.access({
      host: FTP_CONFIG.host,
      user: FTP_CONFIG.user,
      password: FTP_CONFIG.password
    });
    if (FTP_CONFIG.remotePath) await client.ensureDir(FTP_CONFIG.remotePath);
    const dest = FTP_CONFIG.remotePath ? `${FTP_CONFIG.remotePath}/${filename}` : filename;
    await client.uploadFrom(localPath, dest);
    console.log(`>>> [FTP] Fichier envoyé : ${filename}`);
  } catch (err) {
    console.error('>>> [FTP] Erreur upload :', err.message);
    throw err;
  } finally {
    client.close();
  }
}

async function getUltimakerToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiration - 60000) return cachedToken;

  if (!UM_AUTH.clientId || !UM_AUTH.clientSecret) {
    console.warn('>>> [UM] Client ID/secret manquants. Auth Ultimaker désactivée.');
    return null;
  }

  console.log('>>> [UM] Tentative connexion...');

  try {
    const authHeader = Buffer.from(`${UM_AUTH.clientId}:${UM_AUTH.clientSecret}`).toString('base64');
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('scope', UM_AUTH.scopes);

    const response = await axios.post(UM_AUTH.tokenUrl, params, {
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    cachedToken = response.data.access_token;
    tokenExpiration = now + (response.data.expires_in * 1000);
    console.log('>>> [UM] SUCCÈS ! Token récupéré.');
    return cachedToken;
  } catch (error) {
    console.error('>>> [UM] ECHEC AUTH:', error.response ? error.response.status : error.message);
    if (error.response && error.response.data) {
      console.error('>>> Détails:', JSON.stringify(error.response.data));
    }
    return null;
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const firstname = (req.body.firstname || '').trim();
      const lastname = (req.body.lastname || '').trim();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      cb(null, `${firstname || 'user'}.${lastname || 'guest'}_${safeName}`);
    }
  })
});

app.use(express.static('public'));
app.use('/aide', express.static('public/aide'));
app.use(express.json());

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ status: 'error', message: 'Aucun fichier reçu.' });
    }

    await uploadToFTP(req.file.path, req.file.filename);
    res.send({ status: 'success', filename: req.file.filename });
  } catch (err) {
    res.status(500).send({ status: 'error', message: 'Erreur upload : ' + err.message });
  }
});

let bambuClient = null;
const hasBambuConfig = !!(BAMBU_CONFIG.ip && BAMBU_CONFIG.accessCode && BAMBU_CONFIG.serial);

if (hasBambuConfig) {
  try {
    bambuClient = mqtt.connect(`mqtts://${BAMBU_CONFIG.ip}:8883`, {
      username: 'bblp',
      password: BAMBU_CONFIG.accessCode,
      rejectUnauthorized: false
    });

    bambuClient.on('connect', () => {
      console.log('>>> [BAMBU] Connecté');
      bambuClient.subscribe(`device/${BAMBU_CONFIG.serial}/report`);
    });

    bambuClient.on('message', (topic, message) => {
      try {
        const msg = JSON.parse(message.toString());
        const p = printers.find((x) => x.type === 'bambu');
        if (!p || !msg.print) return;

        const d = msg.print;
        if (d.gcode_state) p.status = d.gcode_state;
        if (d.mc_percent) p.progress = d.mc_percent;
        if (d.nozzle_temper) p.tempNozzle = Math.round(d.nozzle_temper);
        if (d.bed_temper) p.tempBed = Math.round(d.bed_temper);
        if (d.subtask_name) p.filename = d.subtask_name.replace('.gcode.3mf', '');

        if (d.mc_remaining_time) {
          const time = new Date();
          time.setMinutes(time.getMinutes() + d.mc_remaining_time);
          p.endTime = time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }

        if (d.ams && d.ams.ams && d.ams.ams[0] && d.ams.ams[0].tray) {
          let activeTrayId = d.ams.tray_now;
          if (activeTrayId === undefined || activeTrayId === '255') activeTrayId = 0;
          const tray = d.ams.ams[0].tray[activeTrayId];
          if (tray) {
            const rawColor = tray.tray_color || 'FFFFFF';
            const colorHex = '#' + rawColor.substring(0, 6);
            const type = tray.tray_sub_brands || tray.tray_type || 'Filament';
            const remain = (tray.remain !== undefined && tray.remain >= 0) ? `${tray.remain}%` : '?';
            p.pla = `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${colorHex}; margin-right:5px; border:1px solid #fff;"></span><span style="color:${colorHex}">${type}</span> <span style="color:#666; font-size:0.8em; margin-left:5px">(${remain})</span>`;
          } else {
            p.pla = 'AMS Ready';
          }
        }

        p.camUrl = `${VIDEO_BASE_URL}/stream.html?src=bambu_h2s`;
        io.emit('printer_update', p);
      } catch (e) {
        console.error('>>> [BAMBU] message parse error:', e.message);
      }
    });
  } catch (e) {
    console.error('>>> [BAMBU] Erreur MQTT:', e.message);
  }
} else {
  console.warn('>>> [BAMBU] Configuration MQTT incomplète; service désactivé.');
}

io.on('connection', (socket) => {
  printers.forEach((printer) => socket.emit('printer_update', printer));

  socket.on('set_pla', (data) => {
    const printer = printers.find((entry) => entry.id === data.id);
    if (printer) {
      printer.pla = data.value;
      io.emit('printer_update', printer);
    }
  });

  socket.on('toggle_pause', async (data) => {
    const printer = printers.find((entry) => entry.id === data.id);
    if (!printer) return;

    if (printer.type === 'bambu' && bambuClient) {
      const command = (printer.status === 'RUNNING') ? 'pause' : 'resume';
      bambuClient.publish(
        `device/${BAMBU_CONFIG.serial}/request`,
        JSON.stringify({ print: { sequence_id: '0', command } })
      );
    } else if (printer.type === 'octo' && printer.ip && printer.key) {
      const action = (printer.status === 'Paused' || printer.status === 'Pausing') ? 'resume' : 'pause';
      try {
        await axios.post(
          `http://${printer.ip}/api/job`,
          { command: 'pause', action },
          { headers: { 'X-Api-Key': printer.key } }
        );
      } catch (e) {
        console.error('>>> [OCTO] pause error:', e.message);
      }
    } else if (printer.type === 'cloud_connect' && printer.cluster_id && printer.job_id) {
      const token = await getUltimakerToken();
      if (token) {
        const action = (printer.status === 'printing') ? 'pause' : 'resume';
        console.log(`>>> [UM CLOUD] Commande ${action} -> ${printer.name}`);
        try {
          await axios.post(
            `https://api.ultimaker.com/connect/v1/clusters/${printer.cluster_id}/print_jobs/${printer.job_id}/action/${action}`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } catch (e) {
          console.error('>>> [UM CLOUD] Erreur Action:', e.response?.data || e.message);
        }
      }
    }
  });
});

setInterval(async () => {
  let cloudClusters = [];
  const token = await getUltimakerToken();

  if (token) {
    try {
      const res = await axios.get('https://api.ultimaker.com/connect/v1/clusters', {
        headers: { Authorization: `Bearer ${token}` }
      });
      cloudClusters = res.data.data || [];
    } catch (e) {
      console.error('>>> [UM] Erreur récupération clusters:', e.message);
    }
  }

  for (const printer of printers) {
    if (printer.type === 'octo') {
      printer.camUrl = `${VIDEO_BASE_URL}/api/stream.mjpeg?src=${printer.streamName}`;
      try {
        const [jobRes, stateRes] = await Promise.all([
          axios.get(`http://${printer.ip}/api/job`, { headers: { 'X-Api-Key': printer.key }, timeout: 1500 }),
          axios.get(`http://${printer.ip}/api/printer`, { headers: { 'X-Api-Key': printer.key }, timeout: 1500 })
        ]);

        printer.status = jobRes.data.state;
        printer.filename = jobRes.data.job?.file?.name || '';
        printer.progress = jobRes.data.progress?.completion ? Number(jobRes.data.progress.completion).toFixed(1) : 0;
        printer.tempNozzle = stateRes.data.temperature?.tool0?.actual?.toFixed(0) || 0;
        printer.tempBed = stateRes.data.temperature?.bed?.actual?.toFixed(0) || 0;

        if (jobRes.data.progress?.printTimeLeft) {
          const time = new Date();
          time.setSeconds(time.getSeconds() + jobRes.data.progress.printTimeLeft);
          printer.endTime = time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }
      } catch (e) {
        // keep last known value and mark offline when unreachable
        printer.status = 'Offline';
      }
    } else if (printer.type === 'cloud_connect') {
      const match = cloudClusters.find((cluster) => cluster.friendly_name === printer.cloud_name || cluster.name === printer.cloud_name);

      if (match) {
        printer.cluster_id = match.id;
        printer.status = match.status;

        if (match.active_print_job && match.active_print_job.status === 'printing') {
          printer.job_id = match.active_print_job.uuid;
          printer.filename = match.active_print_job.name;

          if (match.active_print_job.time_total > 0) {
            printer.progress = ((match.active_print_job.time_elapsed / match.active_print_job.time_total) * 100).toFixed(1);
            const remaining = match.active_print_job.time_total - match.active_print_job.time_elapsed;
            const time = new Date();
            time.setSeconds(time.getSeconds() + remaining);
            printer.endTime = time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          }
        } else {
          printer.filename = '';
          printer.progress = 0;
          printer.endTime = '--:--';
          printer.job_id = null;
        }
      } else {
        printer.status = token ? 'Non trouvée...' : 'Erreur Clé API';
      }
    }

    io.emit('printer_update', printer);
  }
}, 3000);

http.listen(3000, '0.0.0.0', () => {
  console.log('>>> FARM CONTROL READY <<<');
});

module.exports = { app, io, printers };

"""

I’m also improving the deployment, secrets handling, and file persistence without exposing actual credentials.

I’ll update the Docker setup, add a `.env.example`, and make the app use environment variables and a proper upload directory.
