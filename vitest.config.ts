import { defineConfig } from 'vitest/config';

// Cobertura do código que roda no Habblaud: cliente, servidor e shared. Ficam de fora os próprios testes, o
// preview de arte (`client/src/art/preview.ts`, só ferramenta de desenvolvimento), `scripts/` e `dist/`.
// O piso em `thresholds` serve para impedir regressão: se um pull request derrubar a cobertura, o
// `npm run test:coverage` (e o CI) falha. Para subir o piso, rode `npm run test:coverage`, confira o resumo e
// aproxime o valor do medido, mantendo 2-3 pontos de folga, no mesmo PR que adiciona os testes.
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'client/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Mesmo com um teste vermelho, o resumo sai: ajuda a medir sem esconder a falha.
      reportOnFailure: true,
      // Os globs pedem extensões de propósito: `all: true` também varreria README.md e tsconfig.json das pastas.
      include: ['client/src/**/*.{ts,tsx}', 'server/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.test.ts', 'client/src/art/preview.ts', 'scripts/**', 'dist/**'],
      all: true,
      // Piso global (sem `perFile`): medido em 62% de statements, 61% de branches, 64% de funções e 63% de linhas.
      // Os números abaixo ficam ~3 pontos abaixo do medido, para não quebrar por oscilação entre plataformas, mas
      // seguram uma queda real. Subir o piso é parte do PR que adiciona os testes, nunca um passo separado.
      thresholds: {
        perFile: false,
        statements: 59,
        branches: 57,
        functions: 60,
        lines: 60,
      },
    },
  },
});
