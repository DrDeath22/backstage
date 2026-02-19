from conan import ConanFile

class ZlibConan(ConanFile):
    name = "zlib"
    version = "1.3.1"
    description = "A massively spiffy yet delicately unobtrusive compression library"
    license = "Zlib"
    url = "https://github.com/madler/zlib"
    topics = ("compression", "zlib")

    def package_info(self):
        self.cpp_info.libs = ["z"]
