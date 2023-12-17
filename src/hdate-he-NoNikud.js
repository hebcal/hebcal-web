import {hdateStr} from './hdate-he';

const str = hdateStr();
const s2 = str.replace(/[\u0590-\u05bd]/g, '').replace(/[\u05bf-\u05c7]/g, '');
document.write(s2);
