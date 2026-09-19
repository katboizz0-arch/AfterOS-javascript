const input = document.getElementById('terminal-input');
const history = document.getElementById('history');
const terminal = document.getElementById('terminal');

// Tự động tăng chiều cao của textarea theo nội dung code dán vào
input.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

terminal.addEventListener('click', () => input.focus());

input.addEventListener('keydown', function (e) {
    // Khi bấm phím Enter (không cần giữ Ctrl)
    if (e.key === 'Enter') {
        // Nếu người dùng giữ Shift + Enter thì cho phép xuống dòng bình thường
        if (e.shiftKey) {
            return; 
        }

        e.preventDefault(); // Chặn hành vi xuống dòng mặc định của Enter
        const commandText = input.value.trim();
        
        if (commandText) {
            logCommand(commandText);
            processCommand(commandText);
        } else {
            logCommand('');
        }
        
        input.value = '';
        input.style.height = 'auto'; // Reset lại chiều cao của textarea sau khi chạy
        terminal.scrollTop = terminal.scrollHeight;
    }
});

// Thêm sự kiện tự động giãn chiều cao khi gõ hoặc dán code dài
input.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

function logCommand(cmd) {
    const line = document.createElement('div');
    line.innerHTML = `<span class="prompt">user@afteros:~$</span> ${escapeHtml(cmd).replace(/\n/g, '<br>')}`;
    history.appendChild(line);
}

function logOutput(text) {
    const output = document.createElement('div');
    output.textContent = text;
    history.appendChild(output);
}

// Hàm phụ trợ để tránh lỗi hiển thị HTML khi in lệnh dài
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const commands = new Map();
const packageManifestUrl = new URL('./packages/index.json', window.location.href);

function registerCommand(name, handler, description = '') {
    const commandName = String(name).trim().toLowerCase();

    if (!/^[a-z0-9_-]+$/.test(commandName)) {
        throw new Error('Command name may only contain letters, numbers, "_", and "-".');
    }
    if (typeof handler !== 'function') {
        throw new Error(`Handler for "${commandName}" must be a function.`);
    }
    if (commands.has(commandName)) {
        throw new Error(`The command "${commandName}" already exists.`);
    }

    commands.set(commandName, { handler, description });
}

async function installApp(url) {
    let appUrl;
    try {
        appUrl = new URL(url, window.location.href);
    } catch {
        throw new Error('Please provide a valid JavaScript URL.');
    }

    const appModule = await import(appUrl.href);
    const install = appModule.default || appModule.install;

    if (typeof install !== 'function') {
        throw new Error('The app must export a default function or an install function.');
    }

    await install({
        registerCommand,
        logOutput,
        commands: () => [...commands.keys()]
    });
}

function resolveAppUrl(packageNameOrUrl) {
    if (/^[a-z0-9][a-z0-9_-]*$/i.test(packageNameOrUrl)) {
        return new URL(`./packages/${packageNameOrUrl}.js`, window.location.href).href;
    }
    return packageNameOrUrl;
}

async function getVerifiedPackages() {
    const response = await fetch(packageManifestUrl, { cache: 'no-cache' });
    if (!response.ok) {
        throw new Error(`Could not load package list (${response.status}).`);
    }

    const packages = await response.json();
    if (!Array.isArray(packages)) {
        throw new Error('Invalid packages/index.json format.');
    }
    return packages.filter((pkg) =>
        pkg && typeof pkg.name === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(pkg.name)
    );
}

function showPackages(packages) {
    if (packages.length === 0) {
        logOutput('No verified packages found.');
        return;
    }

    packages.forEach((pkg) => {
        logOutput(`${pkg.name}${pkg.description ? ` — ${pkg.description}` : ''}`);
    });
}

async function processCommand(cmd) {
    const trimmedCmd = cmd.trim();
    if (!trimmedCmd) return;

    // Lấy từ đầu tiên để kiểm tra lệnh hệ thống
    const firstSpaceIndex = trimmedCmd.search(/\s/);
    const coreCommand = (firstSpaceIndex === -1 ? trimmedCmd : trimmedCmd.slice(0, firstSpaceIndex)).toLowerCase();

    // 1. Xử lý lệnh 'import'
    if (coreCommand === 'import') {
        const args = trimmedCmd.split(/\s+/).slice(1);
        const packageNameOrUrl = args.join(' ');
        if (!packageNameOrUrl) {
            logOutput('Usage: import <package-name> | import -l | import -s <search>');
            return;
        }

        if (args[0] === '-l') {
            try {
                logOutput('Verified packages:');
                showPackages(await getVerifiedPackages());
            } catch (error) {
                logOutput(`Package list failed: ${error.message}`);
            }
            return;
        }

        if (args[0] === '-s') {
            const search = args.slice(1).join(' ').trim().toLowerCase();
            if (!search) {
                logOutput('Usage: import -s <package-name>');
                return;
            }
            try {
                const matches = (await getVerifiedPackages()).filter((pkg) =>
                    pkg.name.toLowerCase().includes(search)
                );
                showPackages(matches);
            } catch (error) {
                logOutput(`Package search failed: ${error.message}`);
            }
            return;
        }

        const url = resolveAppUrl(packageNameOrUrl);
        logOutput(`Installing app from ${url}...`);
        try {
            await installApp(url);
            logOutput('App installed. Type help to see its commands.');
        } catch (error) {
            logOutput(`Import failed: ${error.message}`);
        }
        return;
    }

    // 2. Kiểm tra các lệnh đã đăng ký (help, about, js, date, clear, exit...)
    const command = commands.get(coreCommand);
    if (command) {
        const args = trimmedCmd.split(/\s+/).slice(1);
        try {
            await command.handler(args, { logOutput, registerCommand });
        } catch (error) {
            logOutput(`${coreCommand}: ${error.message}`);
        }
        return;
    }

    // 3. TỰ ĐỘNG CHẠY JS: Nếu không phải lệnh hệ thống, chạy trực tiếp đoạn code dài vừa dán bằng eval (unsandboxed)
    try {
        const result = (0, eval)(trimmedCmd);
        if (result !== undefined) {
            logOutput(String(result));
        }
    } catch (error) {
        logOutput(`JS Error: ${error.message}`);
    }
}

registerCommand('help', () => {
    logOutput('AfterOS');
    logOutput(' Shift+T to open a terminal');
    logOutput('');
    logOutput(`Available commands: ${[...commands.keys()].join(', ')}`);
}, 'Show available commands');

registerCommand('about', () => {
    logOutput('Terminal (terminal) v0.0.1-demo');
    logOutput('This is a terminal based on Javascript');
}, 'About AfterOS');

registerCommand('js', (args, { logOutput }) => {
    const code = args.join(' ');
    if (!code) {
        logOutput('Usage: js <javascript-code>');
        return;
    }
    try {
        const result = (0, eval)(code);
        if (result !== undefined) {
            logOutput(String(result));
        }
    } catch (error) {
        logOutput(`Error: ${error.message}`);
    }
}, 'Execute arbitrary JavaScript code directly');

registerCommand('date', () => logOutput(new Date().toString()), 'Show the current date');

registerCommand('clear', () => { history.innerHTML = ''; }, 'Clear the terminal');

registerCommand('exit', () => logOutput("'exit' does not support in this version."), 'Close the terminal');