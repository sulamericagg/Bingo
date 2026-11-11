// Página de debug dos blocos: /scripts/dev/blocos.html?cena=casa|caverna|icones|atlas&tier=0..3&giro=1
import { startBlocksDemo } from '../../src/games/floresta/world/content/blocks/demo';

startBlocksDemo(document.getElementById('app')!, new URLSearchParams(location.search));
