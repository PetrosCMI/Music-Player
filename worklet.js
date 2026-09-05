// AudioWorklet processor: phase-vocoder for pitch-preserving playback speed.
// Verified algorithm (see test-dsp.js). Single absolute-position buffer with
// clean shift-down semantics after each emit.
class PhaseVocoderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'speed', defaultValue: 1.0, automationRate: 'k-rate', minValue: 0.25, maxValue: 4.0 }
    ];
  }

  constructor() {
    super();
    this.NFFT = 2048;
    this.H_A = this.NFFT / 2; // 50% overlap for Hann window
    this.synPhase = new Float64Array(this.NFFT);
    this.prevActual = new Float64Array(this.NFFT);
    this.speed = 1.0;
    this.H_S = this.H_A;
    this.buf = new Float64Array(0); // absolute-position overlap-add buffer
    this.absOut = 0;                 // absolute output index of buf[0]
    this.blockCount = 0;             // total blocks emitted so far (absolute)
  }

  process(inputs, outputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0].length) return true;

    // Update synthesis hop from speed parameter (constant within this block)
    if (parametersSpeed(parameters)) {
      const newSpeed = parametersSpeed(parameters);
      if (Math.abs(newSpeed - this.speed) > 0.0001) {
        this.speed = newSpeed;
        this.H_S = Math.max(1, Math.round(this.H_A / this.speed));
      }
    }

    const channel = input[0];
    let pos = 0;
    while (pos + this.NFFT <= channel.length) {
      const frame = new Float64Array(channel.subarray(pos, pos + this.NFFT));
      const block = this.processFrame(frame);
      const start = this.blockCount * this.H_S;
      const end = start + this.NFFT;
      if (end > this.buf.length) {
        const resized = new Float64Array(Math.max(end, this.buf.length === 0 ? this.NFFT : this.buf.length * 2));
        if (this.buf.length) resized.set(this.buf);
        this.buf = resized;
      }
      for (let j = 0; j < this.NFFT; j++) this.buf[start + j] += block[j];
      this.blockCount++;
      pos += this.H_A;
    }

    // Emit everything except a safety window at the tail (next block may overlap)
    const emitLen = Math.max(0, this.blockCount * this.H_S - this.NFFT);
    for (let ch = 0; ch < outputs[0].length; ch++) {
      const outChannel = outputs[0][ch];
      for (let i = 0; i < outChannel.length; i++) {
        const idx = this.absOut + i;
        outChannel[i] = idx < emitLen ? this.buf[idx] : 0;
      }
    }

    // Shift down: keep un-emitted tail, update absOut
    if (emitLen > 0 && emitLen < this.buf.length) {
      const newLen = this.buf.length - emitLen;
      const newBuf = new Float64Array(newLen);
      newBuf.set(this.buf.subarray(emitLen));
      this.buf = newBuf;
    } else {
      this.buf = new Float64Array(0);
    }
    this.absOut += emitLen;

    return true;
  }

  processFrame(frame) {
    const H_S = this.H_S;
    const NFFT = this.NFFT;
    const re = new Float64Array(NFFT);
    const im = new Float64Array(NFFT);
    for (let i = 0; i < NFFT; i++) re[i] = frame[i] * this.win(i);
    this.fft(re, im, false);

    const outRe = new Float64Array(NFFT);
    const outIm = new Float64Array(NFFT);
    for (let k = 0; k < NFFT / 2; k++) {
      const actualPhase = Math.atan2(im[k], re[k]);
      let delta = actualPhase - this.prevActual[k];
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const theta = (2 * Math.PI * k) / NFFT;
      this.synPhase[k] += H_S * theta + (delta - this.H_A * theta);
      this.prevActual[k] = actualPhase;
      const mag = Math.hypot(re[k], im[k]);
      outRe[k] = mag * Math.cos(this.synPhase[k]);
      outIm[k] = mag * Math.sin(this.synPhase[k]);
      outRe[NFFT - k] = outRe[k];
      outIm[NFFT - k] = -outIm[k];
    }
    this.fft(outRe, outIm, true);

    const out = new Float64Array(NFFT);
    for (let i = 0; i < NFFT; i++) out[i] = outRe[i] * this.win(i);
    return out;
  }

  win(i) {
    return 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (this.NFFT - 1));
  }

  fft(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const tr = re[i], ti = im[i];
        re[i] = re[j]; im[i] = im[j];
        re[j] = tr; im[j] = ti;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inverse ? 2 : -2) * Math.PI / len;
      const wRe = Math.cos(ang), wIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let wr = 1, wi = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = i + k + len / 2;
          const tr = wr * re[b] - wi * im[b];
          const ti = wr * im[b] + wi * re[b];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const nw = wr * wRe - wi * wIm;
          wi = wr * wIm + wi * wRe; wr = nw;
        }
      }
    }
    if (inverse) {
      const inv = 1 / n;
      for (let i = 0; i < n; i++) { re[i] *= inv; im[i] *= inv; }
    }
  }
}

function parametersSpeed(parameters) {
  if (!parameters || !parameters.speed || !parameters.speed.length) return null;
  return parameters.speed[0];
}

registerProcessor('phase-vocoder', PhaseVocoderProcessor);
