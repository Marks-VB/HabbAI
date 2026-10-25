// Compila o executável nativo Habblaud.exe e cria o atalho com ícone na Área de Trabalho.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = join(import.meta.dirname, '..');

console.log('Criando ícone de alta resolução (habblaud.ico)...');
execSync(`powershell -ExecutionPolicy Bypass -File "${join(rootDir, 'scripts', 'generate-ico.ps1')}"`, {
  cwd: rootDir,
  stdio: 'inherit',
});

const cscPaths = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
];

const csc = cscPaths.find((p) => existsSync(p)) ?? 'csc';

console.log(`Compilando Habblaud.exe com ${csc}...`);
const cscCmd = `"${csc}" /target:winexe /win32icon:"${join(rootDir, 'habblaud.ico')}" /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:"${join(rootDir, 'Habblaud.exe')}" "${join(rootDir, 'scripts', 'Habblaud.cs')}"`;
execSync(cscCmd, { cwd: rootDir, stdio: 'inherit' });

console.log('Criando atalho na Área de Trabalho...');
execSync(`powershell -ExecutionPolicy Bypass -File "${join(rootDir, 'scripts', 'create-shortcut.ps1')}"`, {
  cwd: rootDir,
  stdio: 'inherit',
});

console.log('Sucesso! Habblaud.exe pronto e atalho criado no Desktop.');
