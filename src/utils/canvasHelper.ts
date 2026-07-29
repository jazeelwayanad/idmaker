import * as fabric from 'fabric';

if (fabric.FabricObject) {
  (fabric.FabricObject as any).customProperties = [
    'name',
    'photoShape',
    'photoRx',
    'photoRy',
    'photoStroke',
    'photoStrokeWidth',
    'photoFill',
    'isAppBackground'
  ];
}

export interface LoadTemplateOptions {
  isPreview?: boolean;
  displayScale?: number;
}

export async function loadTemplateToCanvas(
  canvas: fabric.Canvas,
  designJson: string,
  cardW: number,
  cardH: number,
  options: LoadTemplateOptions = {}
) {
  const { isPreview = false, displayScale = 1 } = options;

  canvas.clear();
  canvas.backgroundColor = '#18181b';

  if (!designJson || designJson === '{}') {
    canvas.renderAll();
    return;
  }

  try {
    const parsed = JSON.parse(designJson);

    // -------------------------------
    // Convert old templates to Hi-Res
    // -------------------------------
    if (!parsed.isHiRes) {
      let multiplier = 1;

      if (
        parsed.backgroundImage &&
        parsed.backgroundImage.width &&
        parsed.backgroundImage.scaleX
      ) {
        multiplier =
          cardW /
          (parsed.backgroundImage.width * parsed.backgroundImage.scaleX);
      } else {
        multiplier = 1 / displayScale;
      }

      if (parsed.backgroundImage) {
        parsed.backgroundImage.left *= multiplier;
        parsed.backgroundImage.top *= multiplier;
        parsed.backgroundImage.scaleX *= multiplier;
        parsed.backgroundImage.scaleY *= multiplier;
      }

      parsed.objects?.forEach((obj: any) => {
        obj.left *= multiplier;
        obj.top *= multiplier;

        if (obj.fontSize) obj.fontSize *= multiplier;
        if (obj.rx) obj.rx *= multiplier;
        if (obj.ry) obj.ry *= multiplier;
      });

      parsed.isHiRes = true;
    }

    // -------------------------------
    // Convert old Fabric backgroundImage
    // into normal object
    // -------------------------------
    if (parsed.backgroundImage) {
      const bg = parsed.backgroundImage;

      bg.isAppBackground = true;
      bg.selectable = false;
      bg.evented = false;

      parsed.objects ??= [];
      parsed.objects.unshift(bg);

      delete parsed.backgroundImage;
    }

    await canvas.loadFromJSON(parsed);

    await document.fonts.ready;

    // -------------------------------
    // Canvas Size
    // -------------------------------
    if (isPreview) {
      canvas.setDimensions({
        width: cardW * displayScale,
        height: cardH * displayScale,
      });

      canvas.setViewportTransform([
        displayScale,
        0,
        0,
        displayScale,
        0,
        0,
      ]);
    } else {
      canvas.setViewportTransform([
        1,
        0,
        0,
        1,
        0,
        0,
      ]);

      canvas.setDimensions({
        width: cardW,
        height: cardH,
      });
    }

    // -------------------------------
    // Background
    // -------------------------------
    let bgImg = canvas
      .getObjects()
      .find((o) => (o as any).isAppBackground);

    if (!bgImg) {
      const first = canvas.getObjects()[0];

      if (first?.type === 'image') {
        bgImg = first;
        (bgImg as any).isAppBackground = true;
      }
    }

    if (bgImg) {
      const element = (bgImg as any)._element as HTMLImageElement | null;

      const imgWidth =
        element?.naturalWidth ||
        element?.width ||
        bgImg.width ||
        cardW;

      const imgHeight =
        element?.naturalHeight ||
        element?.height ||
        bgImg.height ||
        cardH;

      bgImg.set({
        originX: 'left',
        originY: 'top',

        left: 0,
        top: 0,

        scaleX: cardW / imgWidth,
        scaleY: cardH / imgHeight,

        selectable: false,
        evented: false,
      });

      bgImg.setCoords();

      canvas.sendObjectToBack(bgImg);
    }

    canvas.renderAll();
  } catch (err) {
    console.error('Failed to load design template:', err);
  }
}