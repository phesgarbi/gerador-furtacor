// Shader do GERADOR FURTA-COR. Tudo é periódico em uFase (0..1): o último frame emenda no primeiro.
window.VERT = `#version 300 es
in vec2 a; void main(){ gl_Position=vec4(a,0.,1.); }`;

window.FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;        // tamanho total da saída
uniform vec2 uOff;        // deslocamento da faixa (render em pedaços)
uniform float uFase;      // 0..1 dentro do loop
uniform int uLook, uForma, uN, uSeed, uFrame, uVel, uAlfa, uTemLogo, uNF;
uniform int uFT[6];      // pilha de efeitos: tipo (1 vidro, 2 mosaico, 3 linhas, 4 blocos, 5 grão)
uniform int uFM[6];      // modo
uniform vec4 uFP[6];     // parâmetros
uniform float uEsc, uDur, uContr, uLogoAsp, uLogoTam, uLogoRep;
uniform vec3 uPal[8];     // em luz linear
uniform sampler2D uLogo;  // R = alfa nítido, G = desfoque médio, B = desfoque largo
out vec4 o;
const float TAU=6.28318530718;
bool gA;                  // fundo transparente valendo para o look atual

uvec3 pcg(uvec3 v){
  v=v*1664525u+1013904223u; v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y;
  v^=v>>16u; v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y; return v;
}
vec3 h3(ivec3 p){
  uint s=uint(uSeed);
  return vec3(pcg(uvec3(p)+uvec3(s*7919u,s*104729u,s*31u)))*(1.0/4294967295.0);
}
// ruído de gradiente 3D, periódico em z (período pz)
float gn(vec3 x,int pz){
  vec3 i=floor(x); vec3 f=x-i; vec3 u=f*f*f*(f*(f*6.-15.)+10.);
  ivec3 I=ivec3(i); float r=0.;
  for(int k=0;k<8;k++){
    ivec3 c=ivec3(k&1,(k>>1)&1,(k>>2)&1); ivec3 q=I+c; q.z=((q.z%pz)+pz)%pz;
    vec3 g=normalize(h3(q)*2.-1.+1e-4); vec3 cf=vec3(c); vec3 w=mix(1.-u,u,cf);
    r+=dot(g,f-cf)*w.x*w.y*w.z;
  }
  return r*1.25;
}
float fbm(vec2 p,int oct,float sal){
  float a=.5,s=0.; int pz=2*max(uVel,1); float z=uFase*float(2*uVel);
  p+=sal*vec2(17.13,9.71);
  for(int i=0;i<oct;i++){ s+=a*gn(vec3(p,z),pz); p=p*2.02+vec2(31.7,11.3); z*=2.; pz*=2; a*=.5; }
  return s;
}
vec2 warp(vec2 q,float amt,float sal){
  return q+amt*vec2(fbm(q+vec2(3.1,7.7),2,sal),fbm(q+vec2(-5.2,1.3),2,sal+3.));
}
float borda(float f,float d){ float w=mix(.5,.03,d); return smoothstep(.5-w,.5+w,f); }
vec3 palC(float t,float d){            // todas as cores, em ciclo
  float x=fract(t)*float(uN); int i=int(x); float f=x-float(i);
  return mix(uPal[i%uN],uPal[(i+1)%uN],borda(f,d));
}
vec3 palA(float t,float d){            // só as cores depois da 1ª (a 1ª é a base)
  if(uN<2) return uPal[0];
  int n=uN-1; float x=fract(t)*float(n); int i=int(x); float f=x-float(i);
  return mix(uPal[1+i%n],uPal[1+(i+1)%n],borda(f,d));
}
float sinal(){ return uVel>0?1.:0.; }

// 1 FURTA-COR BASE: prata clara com manchas duras de cor
vec4 lFurta(vec2 p){
  vec2 q=vec2(p.x*.55,p.y)*1.1/uEsc;
  float n=fbm(warp(q,.6,0.),3,1.)*1.5+.5;
  float nuv=fbm(q*2.3,3,2.);
  vec3 prata=uPal[0]*(1.+.16*nuv);
  float e=mix(.14,.012,uDur);
  float th=.6;
  float m=smoothstep(th-e,th+e,n);
  float t=(n-th)*2.6+fbm(q*.45,2,5.)*1.3+.1;
  vec3 c=palA(t,uDur*.6);
  vec3 veu=palA(fbm(q*.7,2,8.)*1.5+.3,0.);
  prata=mix(prata,veu,.07*smoothstep(.35,.6,n));
  if(gA) return vec4(c,m);
  return vec4(mix(prata,c,m),1.);
}
// 2 GRADIENTE MACIO
vec4 lMacio(vec2 p){
  vec2 q=vec2(p.x*.5,p.y)*.8/uEsc; float t;
  if(uForma==0) t=fbm(warp(q,.8,0.),2,1.)*1.7+uFase*sinal();
  else if(uForma==1) t=p.y*.9/uEsc+fbm(vec2(q.x,q.y*.3),2,1.)*1.2+uFase*sinal();
  else t=length(vec2(p.x*.35,p.y-.5))/uEsc*.9+fbm(q,2,1.)*.8-uFase*sinal();
  return vec4(palC(t,uDur),1.);
}
// 3 BLOCOS: degraus e faixas deslocadas
vec4 lBlocos(vec2 p){
  float cw=.42*uEsc; int ix=0,iy=0; float ao;
  if(uForma==0){ ix=int(floor(p.x/cw)); ao=p.y; }
  else if(uForma==1){ float R=max(1.,floor(4./uEsc+.5)); iy=int(floor(p.y*R)); ao=p.x*.35; }
  else { ix=int(floor(p.x/cw)); iy=int(floor(p.y*2.+float(ix&1)*.5)); ao=p.y; }
  vec3 h=h3(ivec3(ix,iy,91));
  float n=uVel>0?float(1+int(h.x*float(uVel)*.999)):0.;
  float K=mix(26.,5.,uDur)/uEsc;
  ao=(floor(ao*K)+.5)/K;
  float viz=fbm(vec2(float(ix)*.23,float(iy)*.31),1,4.)*1.6;   // vizinhos parecidos: escada em onda
  float t=ao*(.35+h.y*.3)+viz+h.z*.18+uFase*n;
  return vec4(palC(t,0.),1.);
}
// 4 LÍQUIDO: massas de cor, contorno preto, borda cromática
float campoL(vec2 q){ return fbm(warp(q,.9,0.),2,1.)*2.2; }
float mk(float t,float bw,float e){ return smoothstep(1.-bw-e,1.-bw,abs(fract(t)*2.-1.)); }
vec4 lLiquido(vec2 p){
  vec2 q=vec2(p.x*.6,p.y)*.9/uEsc;
  float K=uForma==0?1.:(uForma==1?2.:3.5);
  float d=.02, fs=uFase*sinal();
  float t=campoL(q)*K+fs, tr=campoL(q+vec2(d,0.))*K+fs, tb=campoL(q-vec2(d,0.))*K+fs;
  float bw=.2, e=mix(.2,.02,uDur);
  vec3 m=vec3(mk(tr,bw,e),mk(t,bw,e),mk(tb,bw,e));
  vec3 c=palC(t*.5,uDur*.5);
  float halo=smoothstep(1.-bw-e-.3,1.-bw,abs(fract(t)*2.-1.));
  vec3 col=mix(c,vec3(1.),halo*.5)*(1.-m);
  float a=1.-min(m.r,min(m.g,m.b));
  return vec4(col,gA?a:1.);
}
// 5 LINHAS: curvas de nível e moiré (serve de look e de efeito)
float linha(float t,float esp,float d){ float s=abs(fract(t)-.5); float w=fwidth(t)*.75+mix(.12,0.,d); return 1.-smoothstep(esp*.5-w,esp*.5+w,s); }
float linhas(vec2 p,int modo,float esc,float N,float esp,float d,float sal,out float tc){
  vec2 q=vec2(p.x*.6,p.y)*.7/esc;
  if(modo==1){
    vec2 pc=vec2(p.x,p.y-.5)/esc; float r=.25*float(uVel);
    vec2 c1=vec2(.9+r*cos(TAU*uFase),.3*r*sin(TAU*uFase));
    vec2 c2=vec2(-.9+r*cos(TAU*uFase+2.),.3*r*sin(TAU*uFase+2.));
    float a=length(pc-c1)*N, b=length(pc-c2)*N; tc=(a+b)*.5;
    return abs(linha(a,esp,d)-linha(b,esp,d));
  }
  float t=modo==0? fbm(warp(q,1.1,sal),2,sal+1.)*N : (p.x*.8/esc+fbm(vec2(q.x*.5,q.y*2.),2,sal+1.)*.6)*N;
  tc=t; return linha(t,esp,d);
}
vec4 lLinhas(vec2 p){
  float tc; float ln=linhas(p,uForma,uEsc,16.,.5,uDur,0.,tc);
  vec2 q=vec2(p.x*.6,p.y)*.7/uEsc;
  vec3 lc=palA(fbm(q*.5,2,6.)*1.4+tc/16.*.6,uDur*.5);
  return vec4(gA?lc:mix(uPal[0],lc,ln),gA?ln:1.);
}
// 8 TECIDO: logo por baixo de um tecido de gradiente que estica e solta
vec3 logoS(vec2 p){
  if(uTemLogo==0) return vec3(0.);
  float asp=uRes.x/uRes.y; float cw=asp/uLogoRep; float x=mod(p.x+asp*.5,cw)-cw*.5;
  vec2 uv=vec2(x/(uLogoTam*uLogoAsp)+.5,(p.y-.5)/uLogoTam+.5);
  if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) return vec3(0.);
  return texture(uLogo,uv).rgb;
}
vec4 lTecido(vec2 p){
  vec2 q=vec2(p.x*.5,p.y)*.8/uEsc;
  vec3 L=logoS(p);
  float H=L.g*.45+L.b*.55;
  float s=.5-.5*cos(TAU*uFase*float(max(uVel,1)));
  s=uVel>0?smoothstep(.08,.85,s):1.;
  float pano=fbm(warp(q,.7,0.),2,1.)*1.6;
  float t=pano*(1.-.55*s)+H*s*1.5+L.r*.12*s;
  return vec4(palC(t,uDur),1.);
}
vec4 lBase(int id,vec2 p){
  if(id==1) return lFurta(p);
  if(id==2) return lMacio(p);
  if(id==3) return lBlocos(p);
  if(id==4) return lLiquido(p);
  if(id==8) return lTecido(p);
  return lLinhas(p);
}
void main(){
  vec2 px=gl_FragCoord.xy+uOff;
  vec2 p=vec2((px.x-uRes.x*.5)/uRes.y,1.-px.y/uRes.y);
  float asp=uRes.x/uRes.y;
  bool tr=uAlfa==1;
  gA=tr&&(uLook==1||uLook==4||uLook==5);
  float aux[6];
  // de cima para baixo: cada efeito mexe na coordenada que o de baixo vai receber
  for(int k=uNF-1;k>=0;k--){
    int T=uFT[k], M=uFM[k]; vec4 P=uFP[k]; float a=1.;
    if(T==1){                                   // VIDRO
      float s=P.x; vec2 l=fract(p/s)-.5; if(M==1) l.y=0.;
      p-=l*s*P.y*1.1;
      float b=max(abs(l.x),abs(l.y));
      a=(1.-P.y*.5*(l.x+l.y))*(1.-P.y*.45*smoothstep(.38,.5,b));
    } else if(T==2){                            // MOSAICO
      float R=max(1.,floor(3./P.x+.5)); float ry=p.y*R; float ri=floor(ry);
      vec3 hr=h3(ivec3(7+k,int(ri),33));
      float cx=p.x*R*mix(.4,.85,hr.x)+hr.y*13.; float ci=floor(cx);
      vec3 h=h3(ivec3(int(ci),int(ri),55+k));
      vec2 l=vec2(fract(cx),fract(ry));
      float n=float(1+int(h.x*2.999));
      float d=uVel>0?fract(uFase*n+h.y):h.y;
      float duty=P.y, e=mix(.12,.004,P.z);
      a=duty>=.999?1.:smoothstep(0.,e,d)*smoothstep(duty,duty-e,d);
      a*=step(.025,l.x)*step(l.x,.975)*step(.04,l.y)*step(l.y,.96);
      p=vec2((h.y-.5)*asp*.85,.5+(h.z-.5)*.5)+(l-.5)*vec2(.5,1.)*mix(.5,1.5,h.x);
    } else if(T==3){                            // LINHAS
      float tc; a=linhas(p,M%10,P.w,P.x,P.y,P.z,20.+float(k)*3.,tc);
    } else if(T==4){                            // BLOCOS / DEGRAUS
      float w=P.x; bool col=M==0;
      float u=col?p.x:p.y, v=col?p.y:p.x;
      float id=floor(u/w); vec3 h=h3(ivec3(int(id),k,77));
      float nn=float(1+int(h.z*2.999));
      v+=P.y*((h.x-.5)*1.2+.3*sin(TAU*(uFase*nn*sinal()+h.y)));
      if(P.z>0.){ float K=mix(40.,4.,P.z); v=(floor(v*K)+.5)/K; u=(id+.5)*w; }
      p=col?vec2(u,v):vec2(v,u);
    }
    aux[k]=a;
  }
  vec4 c=lBase(uLook,p);
  if(!tr) c.a=1.;
  // de baixo para cima: cada efeito mexe na cor
  for(int k=0;k<uNF;k++){
    int T=uFT[k], M=uFM[k]; vec4 P=uFP[k]; float a=aux[k];
    if(T==1) c.rgb*=a;
    else if(T==2||T==3){
      if(tr) c.a*=a; else c.rgb=mix(M>=10?uPal[0]:vec3(0.),c.rgb,a);
    } else if(T==5){
      float g=h3(ivec3(ivec2(px/max(P.y,1.)),uFrame+1000+k*37)).x-.5;
      c.rgb=pow(max(pow(max(c.rgb,0.),vec3(1./2.2))+g*P.x*.35,0.),vec3(2.2));
    }
  }
  vec3 col=pow(max(c.rgb,0.),vec3(1./2.2));
  col=(col-.5)*(1.+uContr)+.5;
  o=vec4(clamp(col,0.,1.),c.a);
}`;
