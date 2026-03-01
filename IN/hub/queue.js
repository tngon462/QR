class PrintQueue {
  constructor(){
    this.items = [];
    this.running = false;
  }

  push(fn){
    return new Promise((resolve, reject) => {
      this.items.push({ fn, resolve, reject });
      this._run();
    });
  }

  async _run(){
    if(this.running) return;
    this.running = true;

    while(this.items.length){
      const item = this.items.shift();
      try{
        const out = await item.fn();
        item.resolve(out);
      }catch(e){
        item.reject(e);
      }
    }

    this.running = false;
  }

  size(){
    return this.items.length + (this.running ? 1 : 0);
  }
}

module.exports = { PrintQueue };
