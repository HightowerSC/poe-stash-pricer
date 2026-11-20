// Runs before install/start: explains clearly when Node.js is too old (works even on very old Node).
var major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 22) {
  console.error('\n  PoE Stash Pricer wymaga Node.js 22 lub nowszego. Masz: ' + process.version);
  console.error('  Windows: pobierz wersję LTS z https://nodejs.org/');
  console.error('  Linux:   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash');
  console.error('           (zamknij i otwórz terminal) nvm install --lts\n');
  process.exit(1);
}
