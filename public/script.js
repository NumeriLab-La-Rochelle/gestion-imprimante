 const socket = io();
        const supervisionGrid = document.getElementById('supervision-grid');
        let pendingFile = null;
        let printerDataCache = {}; // Pour stocker les données et ouvrir le FS

        function switchTab(id) {
            document.querySelectorAll('section').forEach(s => s.classList.remove('active-section'));
            document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
            if(id === 'depot') document.getElementById('depot').style.display = 'flex';
            else document.getElementById('depot').style.display = 'none';
            if(id !== 'depot') document.getElementById(id).classList.add('active-section');
            document.getElementById('btn-'+id).classList.add('active');
        }

        // --- GESTION PLEIN ECRAN ---
        function openFullscreen(id) {
            const data = printerDataCache[id];
            if (!data || !data.camUrl) return;
            
            const overlay = document.getElementById('fs-overlay');
            const container = document.getElementById('fs-content');
            container.innerHTML = ''; // Clean

            if (data.camUrl.includes('.html')) {
                // Bambu (Iframe)
                container.innerHTML = `<iframe src="${data.camUrl}" class="fs-iframe"></iframe>`;
            } else {
                if(data.type === 'octo') {
                    // Ultimaker (Rotated)
                    container.innerHTML = `<img src="${data.camUrl}" class="fs-rotated">`;
                } else {
                    // Standard
                    container.innerHTML = `<img src="${data.camUrl}" class="fs-img">`;
                }
            }
            overlay.style.display = 'flex';
        }

        function closeFullscreen() {
            document.getElementById('fs-overlay').style.display = 'none';
            document.getElementById('fs-content').innerHTML = ''; // Stop stream/iframe
        }

        function createOrUpdateCard(data) {
            // Mise en cache pour le bouton FS
            printerDataCache[data.id] = data;

            let card = document.getElementById(`printer-${data.id}`);
            if (!card) {
                card = document.createElement('div');
                card.className = 'printer-card';
                card.id = `printer-${data.id}`;
                
                let camContent = '<div class="no-cam">[NO SIGNAL]</div>';
                
                // Logique d'affichage Petite Vue
                if (data.type === 'connect') {
                    camContent = '<div class="no-cam">[NO CAM]</div>';
                } else if (data.camUrl) {
                    if (data.camUrl.includes('.html')) {
                        camContent = `<iframe src="${data.camUrl}" class="zoomed-iframe"></iframe>`;
                    } else {
                        if(data.type === 'octo') {
                            camContent = `<img src="${data.camUrl}" class="rotated-cam">`;
                        } else {
                            camContent = `<img src="${data.camUrl}">`;
                        }
                    }
                }

                // AFFICHAGE FILAMENT
                let spoolDisplay = '';
                if (data.type === 'bambu') {
                    spoolDisplay = `<div style="display:flex; align-items:center; font-size:0.8em">${data.pla}</div>`;
                } else {
                    spoolDisplay = `PLA: <input type="number" class="pla-input" value="${data.pla}" onchange="updatePla('${data.id}', this.value)"> g`;
                }

                card.innerHTML = `
                    <div class="card-header">
                        <span style="font-weight:bold">${data.name}</span>
                        <span class="status-txt" style="font-size:0.8em; color:var(--neon-blue)">${data.status}</span>
                    </div>
                    
                    <div class="cam-zone">
                        ${camContent}
                        ${data.camUrl ? `<button class="btn-fullscreen" onclick="openFullscreen('${data.id}')">⤢</button>` : ''}
                    </div>
                    
                    <div class="info-row">
                        <span class="filename">--</span>
                        <span class="end-time" style="color:#aaa">--:--</span>
                    </div>
                    <div class="progress-container"><div class="progress-bar"></div></div>
                    <div class="info-row">
                        <span>Buse: <span class="temp-nozzle" style="color:var(--neon-pink)">0</span>°C</span>
                        <span>Lit: <span class="temp-bed" style="color:var(--neon-pink)">0</span>°C</span>
                    </div>
                    <div class="controls">
                        <div style="font-size:0.8em">${spoolDisplay}</div>
                        <button class="btn-pause" onclick="togglePause('${data.id}')">PAUSE</button>
                    </div>
                `;
                supervisionGrid.appendChild(card);
            }

            // Updates
            card.setAttribute('data-status', data.status);
            card.querySelector('.status-txt').innerText = data.status;
            card.querySelector('.filename').innerText = data.filename || "";
            card.querySelector('.end-time').innerText = "Fin: " + data.endTime;
            card.querySelector('.progress-bar').style.width = data.progress + '%';
            card.querySelector('.temp-nozzle').innerText = data.tempNozzle;
            card.querySelector('.temp-bed').innerText = data.tempBed;

            // Caméra Update
            let camZone = card.querySelector('.cam-zone');
            // On vérifie si le bouton FS existe, sinon on le rajoute
            if(data.camUrl && !camZone.querySelector('.btn-fullscreen')) {
                let btn = document.createElement('button');
                btn.className = 'btn-fullscreen';
                btn.innerText = '⤢';
                btn.onclick = () => openFullscreen(data.id);
                camZone.appendChild(btn);
            }

            if (data.camUrl) {
                if (data.camUrl.includes('.html')) {
                    let iframe = camZone.querySelector('iframe');
                    if(!iframe || iframe.src !== data.camUrl) {
                        // On nettoie pour éviter les doublons
                        let oldImg = camZone.querySelector('img'); if(oldImg) oldImg.remove();
                        // On crée ou met à jour l'iframe
                        if(!iframe) {
                            let newIframe = document.createElement('iframe');
                            newIframe.src = data.camUrl;
                            newIframe.className = "zoomed-iframe";
                            camZone.insertBefore(newIframe, camZone.firstChild); // Insérer AVANT le bouton
                        }
                    }
                } else {
                    let img = camZone.querySelector('img');
                    if(!img) {
                        let oldIframe = camZone.querySelector('iframe'); if(oldIframe) oldIframe.remove();
                        let newImg = document.createElement('img');
                        newImg.src = data.camUrl;
                        if(data.type === 'octo') newImg.className = "rotated-cam";
                        camZone.insertBefore(newImg, camZone.firstChild);
                    }
                }
            }

            // Saisie PLA
            if (data.type !== 'bambu') {
                let plaInput = card.querySelector('.pla-input');
                if (plaInput && document.activeElement !== plaInput) {
                    plaInput.value = data.pla;
                }
            } else {
                let spoolDiv = card.querySelector('.controls div');
                if(spoolDiv) spoolDiv.innerHTML = data.pla; 
            }

            let btnPause = card.querySelector('.btn-pause');
            let s = data.status.toLowerCase();
            if(s.includes('paused') || s.includes('pausing')) {
                btnPause.style.background = 'var(--neon-yellow)'; btnPause.style.color = 'black'; btnPause.innerText = "▶ RESUME";
            } else {
                btnPause.style.background = 'transparent'; btnPause.style.color = 'var(--neon-yellow)'; btnPause.innerText = "⏸ PAUSE";
            }
        }

        socket.on('printer_update', (data) => createOrUpdateCard(data));
        window.updatePla = (id, val) => socket.emit('set_pla', {id, value: val});
        window.togglePause = (id) => socket.emit('toggle_pause', {id});
        function handleFiles(files) { if(files.length > 0) { pendingFile = files[0]; modal.style.display = 'flex'; document.getElementById('user-firstname').focus(); }}
        
        const dropArea = document.getElementById('drop-area');
        const modal = document.getElementById('upload-modal');
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => dropArea.addEventListener(e, (ev) => { ev.preventDefault(); ev.stopPropagation(); }));
        dropArea.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
        function closeModal() { modal.style.display = 'none'; pendingFile = null; }
        function confirmUpload() {
            const fname = document.getElementById('user-firstname').value;
            const lname = document.getElementById('user-lastname').value;
            if(!fname || !lname || !pendingFile) return;
            let formData = new FormData();
            formData.append('firstname', fname); formData.append('lastname', lname); formData.append('file', pendingFile);
            fetch('/upload', { method: 'POST', body: formData })
            .then(r => r.json()).then(d => { alert("Fichier envoyé : " + d.filename); closeModal(); switchTab('supervision'); })
            .catch(e => alert("Erreur upload"));
        }