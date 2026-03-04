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
    btn.innerText = "⏳ SALVATAGGIO...";
    btn.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Recupero dati dai campi
        const cliente = document.getElementById('cliente').value || "Generico";
        const operatore = document.getElementById('operatore').value;
        const dataCarico = document.getElementById('dataCarico').value;
        const vettore = document.getElementById('vettore').value || "N/D";
        const destinazione = document.getElementById('destinazione').value || "N/D";
        const pannelli = document.getElementById('pannelli').value;

        // --- CREAZIONE PDF ---
        doc.setFontSize(22); doc.setTextColor(0, 74, 153);
        doc.text("RAPPORTO DI CARICO", 105, 20, {align: 'center'});
        doc.setFontSize(12); doc.setTextColor(0);
        doc.text(`Operatore: ${operatore} | Data: ${dataCarico}`, 20, 40);
        doc.text(`Cliente: ${cliente}`, 20, 48);
        doc.text(`Vettore: ${vettore}`, 20, 56);
        doc.line(20, 62, 190, 62);
        const splitPannelli = doc.splitTextToSize(pannelli, 170);
        doc.text(splitPannelli, 20, 70);

        // --- AGGIUNTA FOTO MULTIPLE ---
        const fotoFiles = document.getElementById('fotoInput').files;
        if (fotoFiles.length > 0) {
            for (let i = 0; i < fotoFiles.length; i++) {
                const imgData = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(fotoFiles[i]);
                });
                doc.addPage();
                doc.text(`ALLEGATO FOTO ${i+1}`, 105, 20, {align: 'center'});
                doc.addImage(imgData, 'JPEG', 15, 30, 180, 135);
            }
        }

        const pdfBlob = doc.output('blob');
        const fileName = `${Date.now()}_Carico_${cliente.replace(/\s+/g, '_')}.pdf`;

        // 1. CARICAMENTO SU STORAGE
        const { error: storageError } = await supabaseClient.storage
            .from('documenti-carico')
            .upload(fileName, pdfBlob);
        if (storageError) throw storageError;

        // 2. RECUPERO URL PUBBLICO
        const { data: urlData } = supabaseClient.storage.from('documenti-carico').getPublicUrl(fileName);
        const pdfUrl = urlData.publicUrl;

        // 3. SALVATAGGIO NEL DATABASE
        const { error: dbError } = await supabaseClient.from('carichi').insert([{
            operatore, vettore, cliente, destinazione, pannelli,
            spine: datiSpeciali.spine,
            accessori: datiSpeciali.accessori,
            pdf_url: pdfUrl,
            foto_nome: fileName
        }]);
        if (dbError) throw dbError;

        // ... (dopo il salvataggio nel database) ...
        
        // 4. INVIO EMAIL tramite la tua Function specifica
        // Cambiamo il nome da 'send-email-carico' a 'clever-endpoint'
        const { data: funcData, error: funcError } = await supabaseClient.functions.invoke('clever-endpoint', {
            body: { 
                operatore: operatore, 
                cliente: cliente, 
                vettore: vettore, 
                pdfUrl: pdfUrl, 
                fileName: fileName 
            }
        });
        
        if (funcError) {
            console.error("Errore della funzione:", funcError);
            // Se l'errore è qui, la riga nel DB c'è già (processato: false), ma la mail non parte
            throw new Error("Dati salvati, ma errore invio email: " + funcError.message);
        }

        alert("🚀 Carico inviato e salvato correttamente!");
        location.reload();

    } catch (err) {
        console.error(err);
        alert("❌ Errore: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "🚀 GENERA PDF E INVIA";
    }
}

