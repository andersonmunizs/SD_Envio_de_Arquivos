const form = document.getElementById('uploadForm');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('fileInput');
    const statusDiv = document.getElementById('status');

    if (fileInput.files.length === 0) {
        statusDiv.innerText = 'Por favor, selecione um arquivo.';
        statusDiv.style.color = 'red';
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    statusDiv.innerText = 'Enviando...';
    statusDiv.style.color = '#333'; // Cor padrão

    try {
        const response = await fetch('/api/upload', { // Chama /api/upload que é proxied pelo Nginx
            method: 'POST',
            body: formData,
        });

        const resultText = await response.text();
        statusDiv.innerText = resultText;

        if (response.ok) {
            statusDiv.style.color = 'green';
            fileInput.value = ''; // Limpa o input do arquivo após sucesso
        } else {
            statusDiv.style.color = 'red';
        }

    } catch (error) {
        console.error('Erro no upload:', error);
        statusDiv.innerText = 'Erro no upload. Verifique o console ou a conexão de rede.';
        statusDiv.style.color = 'red';
    }
});