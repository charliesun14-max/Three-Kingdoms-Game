import '@fontsource/ma-shan-zheng/400.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import './ui/style.css';
import { Game } from './Game.js';

const params = new URLSearchParams(location.search);
const game = new Game(document.getElementById('app'), document.getElementById('ui'), params);
window.__game = game;
game.boot();
