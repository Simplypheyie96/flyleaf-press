package com.feyidesigns.press;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;

/** Saves a card straight into the phone's gallery, in Pictures/Bookprint, with no
    permission asked (MediaStore, Android 10+). Older phones get "unavailable" and
    the app falls back to the share sheet. See src/native.ts savePhotos. */
@CapacitorPlugin(name = "Gallery")
public class GalleryPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "Bookprint");
        if (data == null) {
            call.reject("No image");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.unavailable("Saving to the gallery needs Android 10");
            return;
        }
        getBridge().execute(() -> {
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Bookprint");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IOException("The gallery refused the image");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IOException("The gallery refused the image");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not save to the gallery", e);
            }
        });
    }
}
