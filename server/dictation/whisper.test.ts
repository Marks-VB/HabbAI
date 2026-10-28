import { posix, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findWhisper, parseWhisperJson } from './whisper';

describe('Whisper local', () => {
  it('lê texto e idioma do JSON do whisper-cli, sem marcas de silêncio', () => {
    const raw = JSON.stringify({ result: { language: 'pt' }, transcription: [{ text: ' Crie um agente' }, { text: ' para o relatório. [BLANK_AUDIO]' }] });
    expect(parseWhisperJson(raw)).toEqual({ text: 'Crie um agente para o relatório.', lang: 'pt' });
    expect(parseWhisperJson('{}')).toEqual({ text: '', lang: '' });
  });

  it('acha binários e o melhor modelo multilíngue (nunca um .en)', () => {
    // O caso do macOS/Linux, com a plataforma fixada: o teste vale igual no Windows.
    const brew = '/opt/homebrew/bin/whisper-cli';
    const ffmpeg = '/opt/homebrew/bin/ffmpeg';
    const models = posix.join('/h', '.local', 'share', 'whisper');
    const have = new Set([brew, ffmpeg, posix.join('/h', '.whisper', 'ggml-base.en.bin'), posix.join(models, 'ggml-base.bin'), posix.join(models, 'ggml-small.bin')]);
    const setup = findWhisper({ HOME: '/h', PATH: '' }, (p) => have.has(p), 'linux');
    expect(setup).toEqual({ bin: brew, ffmpeg, model: posix.join(models, 'ggml-small.bin'), langs: ['pt', 'en'] });
    have.delete(posix.join(models, 'ggml-small.bin'));
    have.delete(posix.join(models, 'ggml-base.bin'));
    expect(findWhisper({ HOME: '/h', PATH: '' }, (p) => have.has(p), 'linux')).toHaveProperty('missing');
    expect(findWhisper({ HOME: '/h', PATH: '' }, () => false, 'linux')).toEqual({ missing: 'whisper-cli (brew install whisper-cpp)' });
    expect(findWhisper({ HOME: '/h', PATH: '', HABBLAUD_DICTATION_LANGS: 'en, pt, xx-bad' }, () => true, 'linux')).toMatchObject({ langs: ['en', 'pt'] });
  });

  it('acha os binários no PATH', () => {
    // POSIX (/usr/bin:/bin): fora dos caminhos fixos do Homebrew.
    const posixHave = new Set(['/usr/bin/whisper-cli', '/usr/bin/ffmpeg', '/h/.whisper/ggml-base.bin']);
    expect(findWhisper({ HOME: '/h', PATH: '/usr/bin:/bin' }, (p) => posixHave.has(p), 'linux')).toEqual({
      bin: '/usr/bin/whisper-cli',
      ffmpeg: '/usr/bin/ffmpeg',
      model: '/h/.whisper/ggml-base.bin',
      langs: ['pt', 'en'],
    });
  });

  it('Windows: PATH com PATHEXT (.exe/.CMD/.BAT) e caminho com .exe explícito', () => {
    // Antes: procurava "whisper-cli" e "ffmpeg" sem extensão; no Windows os binários são .exe e nunca eram achados.
    const tools = 'C:\\tools';
    const model = win32.join('C:\\h', '.whisper', 'ggml-base.bin');
    const have = new Set([win32.join(tools, 'whisper-cli.exe'), win32.join(tools, 'ffmpeg.exe'), model]);
    expect(findWhisper({ HOME: 'C:\\h', PATH: `C:\\nao-existe;${tools}`, PATHEXT: '.EXE;.CMD' }, (p) => have.has(p), 'win32')).toEqual({
      bin: win32.join(tools, 'whisper-cli.exe'),
      ffmpeg: win32.join(tools, 'ffmpeg.exe'),
      model,
      langs: ['pt', 'en'],
    });
    // Extensões de PATHEXT em minúsculas, como o server/claude-bin.ts procura (no Windows o disco não diferencia).
    const lower = new Set([win32.join(tools, 'whisper-cli.cmd'), win32.join(tools, 'ffmpeg.bat'), model]);
    expect(findWhisper({ HOME: 'C:\\h', PATH: tools, PATHEXT: '.CMD;.BAT' }, (p) => lower.has(p), 'win32')).toMatchObject({
      bin: win32.join(tools, 'whisper-cli.cmd'),
      ffmpeg: win32.join(tools, 'ffmpeg.bat'),
    });
    // Caminho explícito com .exe (HABBLAUD_WHISPER_BIN/HABBLAUD_FFMPEG_BIN) e USERPROFILE no lugar do HOME.
    const explicit = 'C:\\Program Files\\whisper\\whisper-cli.exe';
    const ffmpeg = 'C:\\Program Files\\ffmpeg\\ffmpeg.exe';
    expect(
      findWhisper(
        { USERPROFILE: 'C:\\h', PATH: '', HABBLAUD_WHISPER_BIN: explicit, HABBLAUD_FFMPEG_BIN: ffmpeg, HABBLAUD_WHISPER_MODEL: model },
        (p) => [explicit, ffmpeg, model].includes(p),
        'win32',
      ),
    ).toEqual({ bin: explicit, ffmpeg, model, langs: ['pt', 'en'] });
  });
});
