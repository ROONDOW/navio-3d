# O desafio — tente você também

Cole o prompt abaixo no seu modelo ou ferramenta favorita e compare com este repositório.
A versão em inglês vem logo depois.

## Prompt (pt-BR)

```text
Crie, num único arquivo index.html, uma cena 3D em tempo real de um galeão pirata de três mastros
navegando num oceano ao pôr do sol, usando Three.js.

Regras:
1. Nenhum modelo 3D nem textura baixados (.glb, .gltf, .obj, .png): casco, velas, cordame e
   texturas nascem do código.
2. Oceano vivo: soma de ondas de Gerstner no vértice. O navio flutua lendo a MESMA função de onda
   (altura, arfagem e jogo com molas amortecidas). Espuma na proa e rastro atrás.
3. Céu com sol baixo, nuvens e névoa casada com o horizonte; reflexo do sol e do navio na água.
4. Um navio que parece navio: casco curvo com castelo de popa e janelas acesas, três mastros com
   vergas, velas que enchem com o vento, bujarronas na proa, mezena na popa, bandeira e flâmula
   voando a favor do MESMO vento das velas, enxárcias com enfrechates, lanternas, canhões nas
   portinholas e a roda do leme com a bússola à frente do timoneiro.
5. Nada parado: câmera cinematográfica automática que gira e se aproxima sem repetir o caminho.
   O usuário pode girar e dar zoom, e a câmera nunca entra no navio nem na água.
6. Pelo menos 50 FPS a 1280×720 num notebook com placa integrada. Sem texto dentro do canvas.
   Aviso claro se não houver WebGL. Respeitar prefers-reduced-motion.

Quando terminar, ataque a própria cena antes de dizer que ficou pronta: nenhuma vela atravessa
outra, nenhum cabo atravessa vela, nenhuma peça do convés está dentro ou em cima de outra, e o
timoneiro consegue ver a bússola sem virar de costas.
```

## Prompt (English)

```text
In a single index.html file, build a real-time 3D scene of a three-masted pirate galleon sailing
an ocean at sunset, using Three.js.

Rules:
1. No downloaded 3D models or textures (.glb, .gltf, .obj, .png): hull, sails, rigging and textures
   are generated in code.
2. A living ocean: a sum of Gerstner waves in the vertex shader. The ship floats by reading the
   SAME wave function (heave, pitch and roll through damped springs). Bow foam and a wake.
3. A sky with a low sun, clouds and fog that matches the horizon; the sun and the ship reflected
   on the water.
4. A ship that looks like a ship: curved hull with a stern castle and lit windows, three masts with
   yards, sails that fill with the wind, jibs at the bow, a spanker at the stern, a flag and a
   pennant flying with the SAME wind as the sails, shrouds with ratlines, lanterns, cannons at the
   gunports, and the helm with the compass in front of the helmsman.
5. Nothing stands still: an automatic cinematic camera that orbits and dives without repeating
   its path. The user can orbit and zoom, and the camera never enters the ship or the water.
6. At least 50 FPS at 1280×720 on a laptop with integrated graphics. No text inside the canvas.
   A clear notice when WebGL is missing. Respect prefers-reduced-motion.

When you are done, attack your own scene before calling it finished: no sail passes through
another, no rope passes through a sail, no deck piece sits inside or on top of another, and the
helmsman can see the compass without turning their back to the bow.
```

## Como comparar

Abra o seu `index.html` e o deste repositório lado a lado. Os testes em `testes/` medem o que o
olho deixa passar (veja o README).
