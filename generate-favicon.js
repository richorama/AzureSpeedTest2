#!/usr/bin/env node
import fs from 'fs';
import { createCanvas } from 'canvas';

const size = 32;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

// Azure blue background with rounded corners
ctx.fillStyle = '#0078D4';
ctx.beginPath();
ctx.roundRect(0, 0, size, size, 4);
ctx.fill();

// Draw lightning bolt in white
ctx.fillStyle = '#FFFFFF';
ctx.beginPath();
ctx.moveTo(19, 5);    // top point
ctx.lineTo(11, 16);   // middle left
ctx.lineTo(15, 16);   // indent
ctx.lineTo(13, 27);   // bottom point
ctx.lineTo(24, 14);   // middle right
ctx.lineTo(19, 14);   // indent
ctx.closePath();
ctx.fill();

// Save as PNG
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('favicon.png', buffer);
console.log('favicon.png created successfully!');
