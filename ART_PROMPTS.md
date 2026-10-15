# 美术素材与生成提示词

本项目使用内置 image_gen 工具生成和编辑 PNG，参考图仅用于画风参考。原始设计稿保存在 design/，运行素材由 scripts/prepare-art.mjs 等比缩小并编码为 WebP，保留 alpha。当前独立地标版的完整提示词见 design/islands/redesign-brief.json，设计稿见 design/islands/landmarks-v2/source/；此前小幅调整版的提示词保留在 design/islands/generation-manifest.json。选定的 A 款青蛙提示词见 design/frog-concepts/README.md。

已保存文件：

- [学院花园岛](design/source-assets/island-garden.png)
- [森林岛](design/source-assets/island-forest.png)
- [观星岛](design/source-assets/island-observatory.png)
- [荷塘背景](design/source-assets/garden-pond.png)

## island-garden.png

Use case: stylized-concept. Asset type: a single reusable transparent floating-island game sprite for a browser IELTS typing adventure. Input image: reference only for painterly fantasy style, soft warm daylight, exquisite tiny architecture and lush greenery, not an edit target. Primary request: one beautiful isolated floating garden island with pale stone cliffs tapering underneath, lush grass, a small elegant cream stone library tower with pale blue roof, a tiny windmill with terracotta roof, cypress trees, little flowers, shallow turquoise pond, and a narrow waterfall falling off its side. Isometric three-quarter fixed camera, handmade fantasy illustration with refined soft painted textures and delicate detail, like an enchanting miniature diorama. Entire island including cliff and waterfall in frame, centered, generous transparent margin, no sky and no clouds baked into the sprite. Soft afternoon sunlight from upper left, pale sage, turquoise, ivory and warm gold. True transparent background. No text, labels, UI, borders, watermark, ground plane or shadow rectangle. Square composition, 1024x1024.

## island-forest.png

Use case: stylized-concept. Asset type: transparent floating-island game sprite. Reference image is for illustration style only, not an edit target. One isolated floating forest island, whole island centered in square frame with transparent margins. A magnificent ancient tree with a broad lush canopy, delicate stone stairs winding around mossy limestone rocks, tiny wildflowers and mushrooms, a clear turquoise stream with waterfall flowing off the island, a small greenhouse of pale blue glass tucked between trees. Refined painterly fantasy illustration, exquisite miniature landscape matching the soft daylight and detailed greenery of the reference. Pale sage and turquoise, ivory cliffs, warm golden morning light. Isometric three-quarter fixed camera. Genuinely transparent background, no sky, no baked clouds. No text, interface, watermark or ground plane. 1024x1024 square.

## island-observatory.png

Use case: stylized-concept. Asset type: transparent floating-island game sprite. Reference image is only a style reference, not an edit target. One isolated beautiful floating observatory island, complete subject centered with transparent margins in square frame. A small elegant cream stone observatory with pale blue domed roof and brass telescope, an intricate golden armillary sphere on a circular stone terrace, small white arches, cypress trees, flowering bushes, tiny blue glowing crystals, a thin waterfall flowing down its tapered limestone underside. Refined detailed painterly fantasy miniature, soft warm daylight, ivory architecture, sage foliage, delicate blue and warm gold accents, same softly illustrated fantasy mood as the reference. Isometric three-quarter fixed camera. True transparent background; no sky, no clouds, no text, no labels, UI, borders, watermark or ground plane. 1024x1024.


## garden-pond.png

Use case: stylized-concept. Asset type: landscape background for a 2D browser typing game, matching reference image's detailed softly painted fantasy garden style. Reference image: style only, not an edit target. Primary request: a serene turquoise garden pond viewed nearly from above with a gentle isometric tilt. Wide 1000x720 composition (about 1.4:1). Entire central rectangle from x=15% to85% and y=18% to95% must be calm clear unobstructed water with subtle sunlit ripples, where game sprites will be placed. Along leftmost and rightmost 12% edges, beautiful irregular cream limestone banks, lush sage moss, tiny white flowers, reeds, little flowering shrubs. Along topmost 15% a far stone terrace with a low ivory balustrade and garden steps, cypress foliage. Soft warm afternoon sunlight from upper right, pale aqua water, ivory stone and delicate natural greens. Exquisite handpainted miniature fantasy landscape with soft texture, coherent with the floating-island concept. No characters, no frogs, no lily pads in the central water, no stepping stones across the water, no text, no UI, no border or watermark. Do not use low-poly or flat vector art.
