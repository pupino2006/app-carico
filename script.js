const SB_URL = "https://vnzrewcbnoqbqvzckome.supabase.co"; 
const SB_KEY = "sb_publishable_Sq9txbu-PmKdbxETSx2cjw_WqWEFBPO";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let html5QrCode;
let isScanning = false;
let campoTarget = 'pannelli';
let datiSpeciali = { spine: "", accessori: "" };

// NAVIGAZIONE
function openTab(evt, tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).style.display = 'block';
    if(evt) evt.currentTarget.classList.add('active');
}

// ... (Configurazione Supabase e datiSpeciali rimangono uguali) ...

async function apriScannerPerCampo(id) {
    campoTarget = id;
    const container = document.getElementById('qr-reader-container');
    
    // Mostriamo il contenitore PRIMA di avviare la camera
    container.style.display = 'block';
    window.scrollTo(0, 0); 

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    try {
        isScanning = true;
        await html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (text) => {
                if (navigator.vibrate) navigator.vibrate(100);
                
                if (campoTarget === 'pannelli') {
                    addText(text);
                } else {
                    document.getElementById(campoTarget).value = text;
                    toggleScanner(); // Chiude per i campi singoli
                }
            }
        );
    } catch (err) {
        console.error(err);
        alert("Impossibile avviare la fotocamera. Verifica i permessi.");
    }
}

async function toggleScanner() {
    const container = document.getElementById('qr-reader-container');
    if (isScanning && html5QrCode) {
        try {
            await html5QrCode.stop();
            container.style.display = 'none';
            isScanning = false;
        } catch (err) {
            console.error(err);
        }
    } else {
        apriScannerPerCampo('pannelli');
    }
}

function addText(val) {
    const area = document.getElementById('pannelli');
    if (area) {
        area.value += val + "\n";
        area.scrollTop = area.scrollHeight; // Porta il cursore alla fine
    }
}

function addSpecial(tipo, valore) {
    if (!valore) return;

    let testoDaInserire = valore;

    if (tipo === 'spine') {
        // Popup per le spine (Metri Lineari)
        let ml = prompt(`Inserisci i metri lineari (ml) per ${valore}:`, "");
        
        if (ml === null || ml.trim() === "") return; 
        
        testoDaInserire = `${valore} ml ${ml}`;
        datiSpeciali.spine += testoDaInserire + ", ";

    } else if (tipo === 'accessori') {
        // Popup per gli accessori (Note o Quantità)
        let note = prompt(`Aggiungi una nota o quantità per ${valore}:`, "");
        
        // Se l'utente preme OK senza scrivere nulla, aggiungiamo solo l'accessorio.
        // Se preme ANNULLA, non aggiungiamo nulla.
        if (note === null) return; 

        if (note.trim() !== "") {
            testoDaInserire = `${valore} (${note})`;
        } else {
            testoDaInserire = valore;
        }
        
        datiSpeciali.accessori += testoDaInserire + ", ";
        
        // Reset della tendina HTML
        const select = document.getElementById('selectAccessori');
        if (select) select.value = "";
    }

    // Aggiunta al campo di testo principale
    addText(testoDaInserire);
}
// --- GENERAZIONE E INVIO (SISTEMA RAPPORTINI) ---
async function generaEInvia() {
    const btn = document.querySelector('.btn-send');
    btn.innerText = "⏳ SALVATAGGIO IN CORSO...";
    btn.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const cliente = document.getElementById('cliente').value || "Generico";
        const operatore = document.getElementById('operatore').value;
        const dataCarico = document.getElementById('dataCarico').value;
        const vettore = document.getElementById('vettore').value;
        const destinazione = document.getElementById('destinazione').value;
        const listaMateriale = document.getElementById('pannelli').value;

        if (!operatore || !cliente) {
            alert("⚠️ Inserisci almeno Operatore e Cliente!");
            btn.disabled = false;
            btn.innerText = "🚀 GENERA PDF E INVIA";
            return;
        }

        // --- COSTRUZIONE PDF ---
        doc.setFontSize(20); doc.setTextColor(0, 74, 153);
        doc.text("RAPPORTO DI CARICO MERCI", 105, 20, {align: 'center'});
        
        doc.setFontSize(11); doc.setTextColor(0);
        doc.text(`Data: ${dataCarico}`, 20, 40);
        doc.text(`Operatore: ${operatore}`, 20, 47);
        doc.text(`Vettore: ${vettore}`, 20, 54);
        doc.text(`Cliente: ${cliente}`, 20, 61);
        doc.text(`Destinazione: ${destinazione}`, 20, 68);
        
        doc.line(20, 73, 190, 73);
        doc.setFont("helvetica", "bold");
        doc.text("MATERIALE CARICATO:", 20, 80);
        doc.setFont("helvetica", "normal");
        
        const splitLista = doc.splitTextToSize(listaMateriale, 170);
        doc.text(splitLista, 20, 87);

        // Aggiunta Foto (se presenti)
        const fotoFiles = document.getElementById('fotoInput').files;
        if (fotoFiles.length > 0) {
            for (let i = 0; i < fotoFiles.length; i++) {
                const imgData = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(fotoFiles[i]);
                });
                doc.addPage();
                doc.text(`ALLEGATO FOTOGRAFICO ${i+1}`, 105, 20, {align: 'center'});
                doc.addImage(imgData, 'JPEG', 15, 30, 180, 135);
            }
        }

        // 1. TRASFORMA PDF IN BLOB PER UPLOAD
        const pdfBlob = doc.output('blob');
        const fileName = `${Date.now()}_Carico_${cliente.replace(/\s+/g, '_')}.pdf`;

        // 2. UPLOAD SU SUPABASE STORAGE (Usa lo stesso bucket o uno nuovo se preferisci)
        // Assicurati che il bucket 'documenti-carico' esista ed è pubblico
        const { data: storageData, error: storageError } = await supabaseClient
            .storage
            .from('documenti-carico')
            .upload(fileName, pdfBlob);

        if (storageError) throw new Error("Errore Storage: " + storageError.message);

        // 3. OTTIENI URL PUBBLICO
        const { data: urlData } = supabaseClient.storage.from('documenti-carico').getPublicUrl(fileName);
        const pdfUrl = urlData.publicUrl;

        // 4. SALVA NEL DATABASE (Tabella 'carichi')
        const { error: dbError } = await supabaseClient
            .from('carichi')
            .insert([{
                operatore: operatore,
                vettore: vettore,
                cliente: cliente,
                destinazione: destinazione,
                pannelli: listaMateriale,
                spine: datiSpeciali.spine,
                accessori: datiSpeciali.accessori,
                pdf_url: pdfUrl,
                foto_nome: fileName
            }]);

        if (dbError) throw dbError;

        // 5. INVOCA EDGE FUNCTION (Replichiamo l'invio rapportini)
        // NOTA: Usa il nome della tua funzione se diversa da 'send-email-carico'
        const { data: funcData, error: funcError } = await supabaseClient.functions.invoke('send-email-Carico Completo', {
            body: { 
                operatore, 
                cliente, 
                dataInt: dataCarico, 
                descrizione: `Carico merci per ${cliente}. Vettore: ${vettore}`, 
                pdfUrl,
                fileName
            }
        });

        if (funcError) {
            console.error("Errore funzione:", funcError);
            alert("✅ Dati salvati, ma l'invio email ha avuto un problema.");
        } else {
            alert("🚀 Carico salvato e inviato correttamente!");
            location.reload(); // Reset app
        }

        // Scarica copia locale
        doc.save(fileName);

    } catch (err) {
        console.error(err);
        alert("❌ Errore: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "🚀 GENERA PDF E INVIA";
    }
}

