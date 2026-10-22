import {scryptSync,randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {stdin,stdout} from 'node:process';
if(!stdin.isTTY)throw Error('Запустите настройку в интерактивном терминале');
stdout.write('Новый пароль администратора (не менее 14 символов): ');stdin.setRawMode(true);stdin.resume();let pass='';
stdin.on('data',buf=>{for(const ch of buf.toString()){if(ch==='\u0003')process.exit(1);if(ch==='\r'||ch==='\n'){
 stdin.setRawMode(false);stdin.pause();stdout.write('\n');if(pass.length<14||pass.length>256){console.error('Пароль должен содержать от 14 до 256 символов');process.exit(1)}
 const salt=randomBytes(16).toString('hex'),hash=scryptSync(pass,salt,64).toString('hex');pass='';
 let env=existsSync('.env')?readFileSync('.env','utf8'):readFileSync('.env.example','utf8');env=env.replace(/^ADMIN_PASSWORD_HASH=.*$/m,`ADMIN_PASSWORD_HASH=scrypt:${salt}:${hash}`);writeFileSync('.env',env,{mode:0o600});stdout.write('Пароль сохранён в .env в виде хеша. Сам пароль не записан.\n');process.exit(0);
 }else if(ch==='\u007f')pass=pass.slice(0,-1);else if(ch>=' ')pass+=ch;}});
